"""
IngestorService — orchestrates all data source adapters.

Coordinates parallel fetching from npm, GitHub, OSV, Socket, Sigstore,
and local lockfiles into the CoralDB engine.
"""

from __future__ import annotations

import asyncio
from typing import Any

import structlog

from ..config import get_settings
from ..coral.engine import CoralEngine
from ..ecosystems import NPM, PYPI
from .github import GitHubSource
from .lockfile import LockfileSource
from .npm import NpmRegistrySource
from .osv import OSVSource
from .pypi import PyPISource
from .registries import REGISTRY_SOURCES
from .sigstore import SigstoreRekorSource
from .socket import SocketSource

log = structlog.get_logger(__name__)

# Registry metadata is fetched for at most this many packages per ecosystem in one scan, direct dependencies first.
_MAX_PACKAGES_PER_ECOSYSTEM = 500
_REGISTRY_TABLE_ORDER = (
    "npm_packages", "npm_versions", "npm_maintainers",
    "pypi_packages", "pypi_versions",
    "registry_packages", "registry_versions",
)


class IngestorService:
    """
    Orchestrates data ingestion from all sources into CoralDB.

    Usage:
        ingestor = IngestorService()
        await ingestor.full_ingest(project_path="/path/to/project", coral_engine=engine)
    """

    def __init__(self):
        settings = get_settings()
        self._npm = NpmRegistrySource(token=settings.npm_token)
        self._github = GitHubSource(token=settings.github_token)
        self._osv = OSVSource()
        self._socket = SocketSource(api_key=settings.socket_api_key)
        self._sigstore = SigstoreRekorSource()
        self._pypi = PyPISource()
        self._registries = {eco: cls() for eco, cls in REGISTRY_SOURCES.items()}
        self._lockfile = LockfileSource()

    async def ingest_lockfile(self, project_path: str, engine: CoralEngine) -> int:
        """Parse lockfile and source imports; insert into CoralDB."""
        # Run lockfile detection and parsing in executor
        records = await asyncio.get_event_loop().run_in_executor(
            None, self._lockfile.detect_and_parse, project_path
        )
        if not records:
            log.warning("ingest.lockfile_empty", path=project_path)
            return 0

        # A scan describes the project as it is now. Without this, a version the project has since moved
        # off would stay in the table and keep raising findings for a package that is no longer installed.
        for project in {r["project_path"] for r in records}:
            await engine.execute("DELETE FROM local_lockfiles WHERE project_path = :p", {"p": project})
        await engine.ingest("local_lockfiles", records)

        # Also scan source imports in executor
        import_records = await asyncio.get_event_loop().run_in_executor(
            None, self._lockfile.scan_source_imports, project_path
        )
        if import_records:
            await engine.ingest("local_source_packages_mentioned", import_records)

        total = len(records) + len(import_records)
        log.info("ingest.lockfile_complete", path=project_path, records=total)
        return total

    def _registry_source(self, ecosystem: str) -> Any | None:
        """The adapter that reads this ecosystem's registry, or None when none exists."""
        if ecosystem == NPM:
            return self._npm
        if ecosystem == PYPI:
            return self._pypi
        return self._registries.get(ecosystem)

    async def ingest_registry_metadata(self, packages: list[tuple[str, str]], engine: CoralEngine) -> int:
        """Fetch registry metadata for (ecosystem, package) pairs of any ecosystem and ingest it."""
        semaphore = asyncio.Semaphore(10)

        async def fetch_one(ecosystem: str, pkg: str) -> list[dict]:
            source = self._registry_source(ecosystem)
            if source is None:
                return []
            async with semaphore:
                return await source.fetch(package=pkg)

        results = await asyncio.gather(*[fetch_one(e, p) for e, p in packages], return_exceptions=True)

        by_table: dict[str, list[dict]] = {}
        for result in results:
            if isinstance(result, BaseException):
                log.error("ingest.registry_error", error=str(result))
                continue
            for record in result:
                table = record.pop("_table", None)
                if table:
                    by_table.setdefault(table, []).append(record)

        inserted = 0
        # Packages before versions and maintainers, so a reader never sees a version without its package.
        for table in _REGISTRY_TABLE_ORDER:
            if by_table.get(table):
                inserted += await engine.ingest(table, by_table[table])

        log.info("ingest.registry_complete", packages=len(packages), records=inserted)
        return inserted

    async def ingest_npm_packages(self, packages: list[str], engine: CoralEngine) -> int:
        """Fetch npm metadata for a list of packages and ingest into CoralDB."""
        return await self.ingest_registry_metadata([(NPM, p) for p in packages], engine)

    async def ingest_github_org(self, org: str, engine: CoralEngine) -> int:
        """Fetch org repos, commits, and workflows; ingest into CoralDB."""
        repos = await self._github.fetch_org_repos(org)
        if not repos:
            return 0

        await engine.ingest("gh_repos", repos)

        # Fetch details for first 20 repos (cap for performance)
        repo_names = [r["repo_name"] for r in repos[:20]]
        semaphore = asyncio.Semaphore(3)

        async def fetch_repo(repo_name: str) -> list[dict]:
            async with semaphore:
                return await self._github.fetch_repo_full(org, repo_name)

        results = await asyncio.gather(*[fetch_repo(r) for r in repo_names], return_exceptions=True)

        gh_commits: list[dict] = []
        gh_releases: list[dict] = []
        gh_runs: list[dict] = []
        gh_workflows: list[dict] = []

        for result in results:
            if isinstance(result, Exception):
                log.error("ingest.github_error", error=str(result))
                continue
            for record in result:
                table = record.pop("_table", None)
                if table == "gh_commits":
                    gh_commits.append(record)
                elif table == "gh_releases":
                    gh_releases.append(record)
                elif table == "gh_actions_runs":
                    gh_runs.append(record)
                elif table == "gh_workflow_files":
                    gh_workflows.append(record)

        inserted = 0
        for table, records in [
            ("gh_commits", gh_commits),
            ("gh_releases", gh_releases),
            ("gh_actions_runs", gh_runs),
            ("gh_workflow_files", gh_workflows),
        ]:
            if records:
                inserted += await engine.ingest(table, records)

        log.info("ingest.github_complete", org=org, records=inserted)
        return inserted

    async def ingest_malware_feed(self, engine: CoralEngine) -> int:
        """Ask OSV about every exact (ecosystem, package, version) in the lockfiles; store the malicious ones."""
        rows = await engine.query(
            "SELECT DISTINCT ecosystem, package, version FROM local_lockfiles "
            "WHERE version IS NOT NULL AND version != '' ORDER BY ecosystem, package, version"
        )
        records = await self._osv.find_malicious([(r["ecosystem"], r["package"], r["version"]) for r in rows])
        inserted = 0
        # Advisories before the matches that cite them.
        for table in ("osv_advisories", "ossf_malicious_packages"):
            batch = [{k: v for k, v in r.items() if k != "_table"} for r in records if r["_table"] == table]
            if batch:
                inserted += await engine.ingest(table, batch)
        return inserted

    async def ingest_socket_scores(
        self,
        packages: list[tuple[str, str, str]],  # (ecosystem, package, version)
        engine: CoralEngine,
    ) -> int:
        records = await self._socket.fetch_batch_scores(packages)
        if records:
            return await engine.ingest("socket_alerts", records)
        return 0

    async def ingest_npm_publish_events(self, engine: CoralEngine) -> int:
        records = await self._npm.fetch_publish_events_recent(limit=200)
        if records:
            return await engine.ingest("npm_publish_events", records)
        return 0

    async def full_ingest(
        self,
        project_path: str,
        engine: CoralEngine,
        settings: Any = None,
    ) -> dict[str, int]:
        """
        Full parallel ingest: lockfile → npm packages → OSV → Socket → publish events.
        Returns dict of table → records inserted.
        """
        # Phase 1: parse lockfile
        lockfile_count = await self.ingest_lockfile(project_path, engine)

        # Get packages from lockfile for enrichment
        lockfile_rows = await engine.query(
            "SELECT ecosystem, package, MIN(CASE WHEN declared_in = 'direct' THEN 0 ELSE 1 END) AS rank "
            "FROM local_lockfiles GROUP BY ecosystem, package ORDER BY rank, package"
        )
        enrich: list[tuple[str, str]] = []
        skipped = 0
        taken: dict[str, int] = {}
        for r in lockfile_rows:
            eco = r["ecosystem"]
            if self._registry_source(eco) is None:
                continue
            if taken.get(eco, 0) >= _MAX_PACKAGES_PER_ECOSYSTEM:
                skipped += 1
                continue
            taken[eco] = taken.get(eco, 0) + 1
            enrich.append((eco, r["package"]))
        if skipped:
            log.warning("ingest.registry_truncated", skipped=skipped, limit=_MAX_PACKAGES_PER_ECOSYSTEM)
        npm_packages = [p for e, p in enrich if e == NPM]

        # Phase 2: parallel enrichment
        results = await asyncio.gather(
            self.ingest_registry_metadata(enrich, engine),
            self.ingest_malware_feed(engine),
            self.ingest_socket_scores(
                [("npm", p, "") for p in npm_packages[:50]],
                engine,
            ),
            self.ingest_npm_publish_events(engine),
            return_exceptions=True,
        )

        step_names = ("registry", "malware_feed", "socket", "publish_events")
        failed = [n for n, r in zip(step_names, results, strict=True) if isinstance(r, BaseException)]
        for name, result in zip(step_names, results, strict=True):
            if isinstance(result, BaseException):
                # A feed that could not be read is not an all-clear: say so loudly.
                log.error("ingest.step_failed", step=name, error=str(result))

        totals: dict[str, int] = {
            "failed_steps": len(failed),
            "lockfile": lockfile_count,
            "registry": results[0] if isinstance(results[0], int) else 0,
            "registry_skipped": skipped,
            "malware_feed": results[1] if isinstance(results[1], int) else 0,
            "socket": results[2] if isinstance(results[2], int) else 0,
            "publish_events": results[3] if isinstance(results[3], int) else 0,
        }

        log.info("ingest.full_complete", **totals)
        return totals

    async def start_npm_firehose(self, engine: CoralEngine) -> None:
        """Start a background task that continuously streams npm publish events."""
        log.info("ingest.firehose_start")
        async for event in self._npm.stream():
            try:
                if event.get("package"):
                    await engine.ingest("npm_publish_events", [{
                        "package": event["package"],
                        "version": event.get("version", ""),
                        "published_at": event.get("timestamp"),
                        "published_by": "",
                        "npm_org": None,
                        "publish_via": "firehose",
                        "source_ip_country": None,
                    }])
            except Exception as exc:
                log.error("ingest.firehose_error", error=str(exc))
