"""
npm registry adapter.

Fetches package metadata, version history, maintainer changes,
and streams the npm publish firehose.
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from typing import Any

import httpx
import structlog

from .base import DataSource
from .provenance import npm_provenance_repo, recent_with_predecessor

log = structlog.get_logger(__name__)

_NPM_REGISTRY = "https://registry.npmjs.org"
_SKIMDB = "https://skimdb.npmjs.com/registry"
_NPM_DOWNLOADS = "https://api.npmjs.org/downloads/point/last-week"


class NpmRegistrySource(DataSource):
    name = "npm_registry"
    tables = ["npm_packages", "npm_versions", "npm_maintainers", "npm_publish_events"]

    def __init__(self, token: str = "", cache_ttl: int = 300, transport: httpx.AsyncBaseTransport | None = None):
        self._token = token
        self._transport = transport
        self._cache: dict[str, tuple[Any, float]] = {}
        self._cache_ttl = cache_ttl
        self._semaphore = asyncio.Semaphore(10)

    def _client(self) -> httpx.AsyncClient:
        headers = {"User-Agent": "crowsnest/0.1 (supply-chain-security)"}
        if self._token:
            headers["Authorization"] = f"Bearer {self._token}"
        return httpx.AsyncClient(
            headers=headers,
            timeout=httpx.Timeout(connect=30.0, read=60.0, write=30.0, pool=5.0),
            follow_redirects=True,
            transport=self._transport,
        )

    async def weekly_downloads(self, name: str) -> int | None:
        """Last-week download count from the npm downloads API, or None when it cannot be read."""
        try:
            async with self._client() as client:
                resp = await client.get(f"{_NPM_DOWNLOADS}/{name}")
                resp.raise_for_status()
                count = resp.json().get("downloads")
        except (httpx.HTTPError, ValueError) as exc:
            log.warning("npm.downloads_error", package=name, error=str(exc))
            return None
        return count if isinstance(count, int) else None

    async def fetch(self, package: str | None = None, **kwargs: Any) -> list[dict[str, Any]]:
        if package:
            return await self._fetch_package_records(package, kwargs.get("versions"))
        return []

    async def _fetch_package_records(self, name: str, versions: list[str] | None = None) -> list[dict[str, Any]]:
        """Returns one npm_packages record + many npm_versions records."""
        async with self._semaphore:
            try:
                async with self._client() as client:
                    resp = await client.get(f"{_NPM_REGISTRY}/{name}")
                    if resp.status_code == 404:
                        return []
                    resp.raise_for_status()
                    data = resp.json()
            except httpx.HTTPError as exc:
                log.error("npm.fetch_error", package=name, error=str(exc))
                return []

        records: list[dict[str, Any]] = []

        time_data: dict[str, str] = data.get("time", {})
        created_at = _parse_ts(time_data.get("created"))
        updated_at = _parse_ts(time_data.get("modified"))

        latest_version = data.get("dist-tags", {}).get("latest", "")
        latest_data = data.get("versions", {}).get(latest_version, {})
        scripts = latest_data.get("scripts", {})
        has_install_script = any(
            k in scripts for k in ("install", "postinstall", "preinstall", "prepare")
        )

        maintainers_raw = data.get("maintainers", [])
        maintainer_names = [
            m.get("name") or m.get("username") or str(m)
            for m in maintainers_raw
            if isinstance(m, dict)
        ]

        pkg_record = {
            "name": name,
            "latest_version": latest_version,
            "total_versions": len(data.get("versions", {})),
            "weekly_downloads": await self.weekly_downloads(name),
            "repo_url": _extract_repo_url(data),
            "license": latest_data.get("license", ""),
            "maintainers": maintainer_names,
            "created_at": created_at,
            "updated_at": updated_at,
            "has_install_script": has_install_script,
            "unpacked_size": latest_data.get("dist", {}).get("unpackedSize", 0),
            "dist_tags": json.dumps(data.get("dist-tags", {})),
        }
        records.append({"_table": "npm_packages", **pkg_record})

        for ver, vdata in data.get("versions", {}).items():
            scripts_v = vdata.get("scripts", {})
            ver_record = {
                "name": name,
                "version": ver,
                "published_at": _parse_ts(time_data.get(ver)),
                "published_by": (vdata.get("_npmUser") or {}).get("name", ""),
                "tarball_url": vdata.get("dist", {}).get("tarball", ""),
                "shasum": vdata.get("dist", {}).get("shasum", ""),
                "integrity": vdata.get("dist", {}).get("integrity", ""),
                "dependencies": json.dumps(vdata.get("dependencies", {})),
                "dev_dependencies": json.dumps(vdata.get("devDependencies", {})),
                "has_install_script": any(k in scripts_v for k in ("preinstall", "install", "postinstall")),
                "has_postinstall": "postinstall" in scripts_v,
                "has_prepare": "prepare" in scripts_v,
                "attestation_subject_uri": None,   # filled by sigstore source
                "attestation_predicate_type": None,
                "unpacked_size": (vdata.get("dist") or {}).get("unpackedSize"),
                "has_provenance": bool((vdata.get("dist") or {}).get("attestations")),
                "provenance_repo": None,
            }
            records.append({"_table": "npm_versions", **ver_record})

        await self._add_provenance_repos(name, data, records, time_data, versions)

        seen_maintainers: dict[str, str] = {}  # login → first version published
        for ver, vdata in sorted(
            data.get("versions", {}).items(),
            key=lambda kv: time_data.get(kv[0], ""),
        ):
            publisher = (vdata.get("_npmUser") or {}).get("name", "")
            if publisher and publisher not in seen_maintainers:
                seen_maintainers[publisher] = ver
                records.append({"_table": "npm_maintainers",
                    "package": name,
                    "maintainer_login": publisher,
                    "action": "add",
                    "ts": _parse_ts(time_data.get(ver)),
                    "performed_by": publisher,
                })

        return records

    async def _add_provenance_repos(
        self, name: str, data: dict[str, Any], records: list[dict[str, Any]], time_data: dict[str, str],
        versions: list[str] | None = None,
    ) -> None:
        """Fill `provenance_repo` for the versions asked about (default: the newest) that carry provenance."""
        published = {v: _parse_ts(time_data.get(v)) for v in data.get("versions", {})}
        wanted = recent_with_predecessor(published, focus=versions)
        targets = {
            r["version"]: r for r in records
            if r["_table"] == "npm_versions" and r["version"] in wanted and r["has_provenance"]
        }
        if not targets:
            return

        async def one(version: str) -> None:
            url = ((data["versions"][version].get("dist") or {}).get("attestations") or {}).get("url")
            if not url:
                return
            async with self._semaphore:
                try:
                    async with self._client() as client:
                        resp = await client.get(url)
                        resp.raise_for_status()
                        targets[version]["provenance_repo"] = npm_provenance_repo(resp.json())
                except (httpx.HTTPError, ValueError) as exc:
                    log.warning("npm.provenance_error", package=name, version=version, error=str(exc))

        await asyncio.gather(*[one(v) for v in targets])

    async def fetch_publish_events_recent(self, limit: int = 100) -> list[dict[str, Any]]:
        """Fetch recent publish events from the npm changes feed."""
        try:
            async with self._client() as client:
                resp = await client.get(
                    f"{_SKIMDB}/_changes",
                    params={"descending": "true", "limit": str(limit)},
                )
                resp.raise_for_status()
                data = resp.json()
        except httpx.HTTPError as exc:
            log.error("npm.publish_events_error", error=str(exc))
            return []

        records = []
        for row in data.get("results", []):
            doc = row.get("doc", {})
            name = doc.get("name", row.get("id", ""))
            time_data = doc.get("time", {})
            latest_ver = (doc.get("dist-tags") or {}).get("latest", "")
            if latest_ver and name:
                publisher = (
                    (doc.get("versions", {}).get(latest_ver) or {})
                    .get("_npmUser", {}) or {}
                ).get("name", "")
                records.append({
                    "package": name,
                    "version": latest_ver,
                    "published_at": _parse_ts(time_data.get(latest_ver)),
                    "published_by": publisher,
                    "npm_org": name.split("/")[0] if name.startswith("@") else None,
                    "publish_via": "cli",
                    "source_ip_country": None,
                })

        return records

    async def stream(self, **kwargs: Any) -> AsyncIterator[dict[str, Any]]:  # type: ignore[override]
        """Stream the npm publish firehose (continuous changes feed)."""
        seq = "now"
        while True:
            try:
                async with self._client() as client:
                    async with client.stream(
                        "GET",
                        f"{_SKIMDB}/_changes",
                        params={"feed": "longpoll", "since": seq, "limit": "50", "include_docs": "false"},
                        timeout=60.0,
                    ) as resp:
                        resp.raise_for_status()
                        data = resp.json()

                for row in data.get("results", []):
                    seq = row.get("seq", seq)
                    name = row.get("id", "")
                    if name:
                        yield {
                            "type": "publish_event",
                            "package": name,
                            "seq": seq,
                            "timestamp": datetime.now(UTC).isoformat(),
                        }

                await asyncio.sleep(1)

            except Exception as exc:
                log.warning("npm.firehose_error", error=str(exc))
                await asyncio.sleep(10)


def _parse_ts(val: str | None) -> datetime | None:
    if not val:
        return None
    try:
        return datetime.fromisoformat(val.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None


def _extract_repo_url(data: dict[str, Any]) -> str:
    repo = data.get("repository") or {}
    if isinstance(repo, str):
        return repo
    url = repo.get("url", "")
    # Normalise git+https://github.com/... → https://github.com/...
    url = url.removeprefix("git+").removeprefix("git://")
    if url.endswith(".git"):
        url = url[:-4]
    return url
