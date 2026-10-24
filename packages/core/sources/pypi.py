"""PyPI package registry adapter."""

from __future__ import annotations

import asyncio
import json
import re
from collections.abc import Mapping
from datetime import datetime
from typing import Any
from urllib.parse import urlparse

import httpx
import structlog

from ..ecosystems import PYPI, normalize_package_name
from .base import DataSource
from .provenance import pypi_provenance_repo, recent_with_predecessor

log = structlog.get_logger(__name__)

_PYPI_API = "https://pypi.org/pypi"
_PYPI_STATS = "https://pypistats.org/api/packages"
_REPO_HOSTS = {"github.com", "www.github.com", "gitlab.com", "www.gitlab.com"}
_PYPI_INTEGRITY = "https://pypi.org/integrity"


class PyPISource(DataSource):
    name = "pypi"
    tables = ["pypi_packages", "pypi_versions"]

    def __init__(self, transport: httpx.AsyncBaseTransport | None = None):
        self._transport = transport

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            headers={"User-Agent": "crowsnest/0.1 (supply-chain-security)"},
            timeout=httpx.Timeout(30.0),
            transport=self._transport,
        )

    async def weekly_downloads(self, name: str) -> int | None:
        """Last-week download count from pypistats.org, or None when it cannot be read."""
        try:
            async with self._client() as client:
                resp = await client.get(f"{_PYPI_STATS}/{name}/recent")
                resp.raise_for_status()
                count = (resp.json().get("data") or {}).get("last_week")
        except (httpx.HTTPError, ValueError) as exc:
            log.warning("pypi.downloads_error", package=name, error=str(exc))
            return None
        return count if isinstance(count, int) else None

    async def fetch(self, package: str = "", **kwargs: Any) -> list[dict[str, Any]]:
        if package:
            return await self._fetch_package_records(package)
        return []

    async def _fetch_package_records(self, name: str) -> list[dict[str, Any]]:
        name = normalize_package_name(PYPI, name)
        try:
            async with self._client() as client:
                resp = await client.get(f"{_PYPI_API}/{name}/json")
                if resp.status_code == 404:
                    return []
                resp.raise_for_status()
                data = resp.json()
        except httpx.HTTPError as exc:
            log.error("pypi.fetch_error", package=name, error=str(exc))
            return []

        info = data.get("info", {})
        records: list[dict[str, Any]] = []

        maintainers = [m for m in (info.get("author"), info.get("maintainer")) if m]

        # A release's date is its earliest file upload; a package's first and last release bound its age.
        published = {
            ver: min(t for t in (_parse_ts(f.get("upload_time_iso_8601")) for f in files) if t)
            for ver, files in data.get("releases", {}).items()
            if files and any(_parse_ts(f.get("upload_time_iso_8601")) for f in files)
        }
        name = normalize_package_name(PYPI, name)

        pkg_record = {
            "name": name,
            "latest_version": info.get("version", ""),
            "weekly_downloads": await self.weekly_downloads(name),
            "repo_url": _repo_url(info),
            "license": info.get("license", "") or "",
            "maintainers": maintainers,
            "created_at": min(published.values()) if published else None,
            "updated_at": max(published.values()) if published else None,
        }
        records.append({"_table": "pypi_packages", **pkg_record})

        for ver, published_at in published.items():
            records.append({"_table": "pypi_versions",
                "name": name,
                "version": ver,
                "published_at": published_at,
                "published_by": "",  # PyPI's public API does not name the uploader
                "requires_python": info.get("requires_python", "") or "",
                "dependencies": None,
                "unpacked_size": None,
                "has_provenance": None,
                "provenance_repo": None,
            })

        await self._add_release_details(name, published, records)
        return records

    async def _add_release_details(
        self, name: str, published: Mapping[str, datetime | None], records: list[dict[str, Any]],
    ) -> None:
        """Dependencies, file size and provenance for recent releases (and each one's predecessor)."""
        wanted = recent_with_predecessor(published)
        targets = {r["version"]: r for r in records if r["_table"] == "pypi_versions" and r["version"] in wanted}
        if not targets:
            return
        semaphore = asyncio.Semaphore(5)

        async def one(version: str) -> None:
            row = targets[version]
            async with semaphore, self._client() as client:
                try:
                    resp = await client.get(f"{_PYPI_API}/{name}/{version}/json")
                    resp.raise_for_status()
                    release = resp.json()
                except (httpx.HTTPError, ValueError) as exc:
                    log.warning("pypi.release_error", package=name, version=version, error=str(exc))
                    return
                row["dependencies"] = json.dumps(_dependency_names(release.get("info", {}).get("requires_dist")))
                files = release.get("urls") or []
                chosen = next((f for f in files if str(f.get("filename", "")).endswith(".whl")), files[0] if files else None)
                if not chosen:
                    return
                row["unpacked_size"] = chosen.get("size")
                try:
                    prov = await client.get(f"{_PYPI_INTEGRITY}/{name}/{version}/{chosen['filename']}/provenance")
                    if prov.status_code == 404:
                        row["has_provenance"] = False
                        return
                    prov.raise_for_status()
                    row["has_provenance"] = True
                    row["provenance_repo"] = pypi_provenance_repo(prov.json())
                except (httpx.HTTPError, ValueError) as exc:
                    log.warning("pypi.provenance_error", package=name, version=version, error=str(exc))

        await asyncio.gather(*[one(v) for v in targets])


_REQUIREMENT_NAME = re.compile(r"^\s*([A-Za-z0-9][A-Za-z0-9._-]*)")


def _dependency_names(requires_dist: list[str] | None) -> list[str]:
    """Normalised names a release installs by default (optional extras are not part of a plain install)."""
    names: set[str] = set()
    for line in requires_dist or []:
        requirement, _, marker = line.partition(";")
        match = _REQUIREMENT_NAME.match(requirement)
        if match and "extra ==" not in marker.replace("'", '"').replace('extra=="', 'extra == "'):
            names.add(normalize_package_name(PYPI, match.group(1)))
    return sorted(names)


def _repo_url(info: dict[str, Any]) -> str:
    """The project's source repository, from whichever label its author used for it."""
    urls = {k.lower(): v for k, v in (info.get("project_urls") or {}).items() if v}
    for label in ("source", "source code", "repository", "code", "github", "homepage"):
        if label in urls:
            return urls[label].rstrip("/").removesuffix(".git")
    for url in urls.values():
        if urlparse(url).hostname in _REPO_HOSTS:
            return url.rstrip("/").removesuffix(".git")
    return (info.get("home_page") or "").rstrip("/").removesuffix(".git")


def _parse_ts(val: str | None) -> datetime | None:
    if not val:
        return None
    try:
        return datetime.fromisoformat(val.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None
