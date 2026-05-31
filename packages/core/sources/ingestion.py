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
from .github import GitHubSource
from .lockfile import LockfileSource
from .npm import NpmRegistrySource
from .osv import OSVSource
from .pypi import PyPISource
from .sigstore import SigstoreRekorSource
from .socket import SocketSource

log = structlog.get_logger(__name__)


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

    async def ingest_npm_packages(self, packages: list[str], engine: CoralEngine) -> int:
        """Fetch npm metadata for a list of packages and ingest into CoralDB."""
        semaphore = asyncio.Semaphore(10)

        async def fetch_one(pkg: str) -> list[dict]:
            async with semaphore:
                return await self._npm.fetch(package=pkg)

        results = await asyncio.gather(*[fetch_one(p) for p in packages], return_exceptions=True)

        npm_packages: list[dict] = []
        npm_versions: list[dict] = []
        npm_maintainers: list[dict] = []

        for result in results:
            if isinstance(result, Exception):
                log.error("ingest.npm_error", error=str(result))
                continue
            for record in result:
                table = record.pop("_table", None)
                if table == "npm_packages":
                    npm_packages.append(record)
                elif table == "npm_versions":
                    npm_versions.append(record)
                elif table == "npm_maintainers":
                    npm_maintainers.append(record)

        inserted = 0
        if npm_packages:
            inserted += await engine.ingest("npm_packages", npm_packages)
        if npm_versions:
            inserted += await engine.ingest("npm_versions", npm_versions)
        if npm_maintainers:
            inserted += await engine.ingest("npm_maintainers", npm_maintainers)

        log.info("ingest.npm_complete", packages=len(packages), records=inserted)
        return inserted

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

    async def ingest_osv_advisories(
        self,
        packages: list[tuple[str, str]],  # (ecosystem, package)
        engine: CoralEngine,
    ) -> int:
        records = await self._osv.fetch_batch(packages)
        if records:
            return await engine.ingest("osv_advisories", records)
        return 0

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
        lockfile_rows = await engine.query("SELECT DISTINCT package, ecosystem FROM local_lockfiles LIMIT 500")
        npm_packages = [r["package"] for r in lockfile_rows if r.get("ecosystem") == "npm"]
        pypi_packages = [r["package"] for r in lockfile_rows if r.get("ecosystem") == "pypi"]
        all_packages = [(r["ecosystem"], r["package"]) for r in lockfile_rows]

        # Phase 2: parallel enrichment
        results = await asyncio.gather(
            self.ingest_npm_packages(npm_packages[:100], engine),
            self.ingest_osv_advisories(all_packages[:500], engine),
            self.ingest_socket_scores(
                [("npm", p, "") for p in npm_packages[:50]],
                engine,
            ),
            self.ingest_npm_publish_events(engine),
            return_exceptions=True,
        )

        totals: dict[str, int] = {
            "lockfile": lockfile_count,
            "npm": results[0] if isinstance(results[0], int) else 0,
            "osv": results[1] if isinstance(results[1], int) else 0,
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
