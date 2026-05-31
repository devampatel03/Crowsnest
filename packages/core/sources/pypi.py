"""PyPI package registry adapter."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

import httpx
import structlog

from .base import DataSource

log = structlog.get_logger(__name__)

_PYPI_API = "https://pypi.org/pypi"


class PyPISource(DataSource):
    name = "pypi"
    tables = ["pypi_packages", "pypi_versions"]

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            headers={"User-Agent": "crowsnest/0.1 (supply-chain-security)"},
            timeout=httpx.Timeout(30.0),
        )

    async def fetch(self, package: str = "", **kwargs: Any) -> list[dict[str, Any]]:
        if package:
            return await self._fetch_package_records(package)
        return []

    async def _fetch_package_records(self, name: str) -> list[dict[str, Any]]:
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

        # ── pypi_packages ─────────────────────────────────────────────────
        maintainers = []
        if info.get("author"):
            maintainers.append(info["author"])

        pkg_record = {
            "name": name,
            "latest_version": info.get("version", ""),
            "weekly_downloads": 0,   # PyPI stats API is separate
            "repo_url": (info.get("project_urls") or {}).get("Source", info.get("home_page", "")),
            "license": info.get("license", ""),
            "maintainers": maintainers,
            "created_at": None,
            "updated_at": None,
        }
        records.append({"_table": "pypi_packages", **pkg_record})

        # ── pypi_versions ─────────────────────────────────────────────────
        for ver, releases in data.get("releases", {}).items():
            if not releases:
                continue
            first_release = releases[0]
            records.append({"_table": "pypi_versions",
                "name": name,
                "version": ver,
                "published_at": _parse_ts(first_release.get("upload_time_iso_8601")),
                "published_by": first_release.get("uploader", ""),
                "requires_python": info.get("requires_python", ""),
            })

        return records


def _parse_ts(val: str | None) -> datetime | None:
    if not val:
        return None
    try:
        return datetime.fromisoformat(val.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None
