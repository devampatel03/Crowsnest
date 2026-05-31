"""OSV.dev vulnerability database adapter."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

import httpx
import structlog

from .base import DataSource

log = structlog.get_logger(__name__)

_OSV_API = "https://api.osv.dev/v1"


class OSVSource(DataSource):
    name = "osv"
    tables = ["osv_advisories"]

    def __init__(self):
        self._client_opts = {
            "headers": {"User-Agent": "crowsnest/0.1 (supply-chain-security)"},
            "timeout": httpx.Timeout(30.0, read=60.0),
        }

    async def fetch(self, ecosystem: str = "", package: str = "", **kwargs: Any) -> list[dict[str, Any]]:
        if ecosystem and package:
            return await self.fetch_advisories_for_package(ecosystem, package)
        return []

    async def fetch_advisories_for_package(self, ecosystem: str, package: str) -> list[dict[str, Any]]:
        payload = {"package": {"name": package, "ecosystem": ecosystem}}
        try:
            async with httpx.AsyncClient(**self._client_opts) as client:
                resp = await client.post(f"{_OSV_API}/query", json=payload)
                if resp.status_code == 404:
                    return []
                resp.raise_for_status()
                data = resp.json()
        except httpx.HTTPError as exc:
            log.error("osv.fetch_error", package=package, error=str(exc))
            return []

        return [_parse_advisory(v) for v in data.get("vulns", [])]

    async def fetch_batch(self, packages: list[tuple[str, str]]) -> list[dict[str, Any]]:
        """Batch query up to 1000 packages at once."""
        queries = [{"package": {"name": p, "ecosystem": e}} for e, p in packages]
        payload = {"queries": queries[:1000]}

        try:
            async with httpx.AsyncClient(**self._client_opts) as client:
                resp = await client.post(f"{_OSV_API}/querybatch", json=payload)
                resp.raise_for_status()
                data = resp.json()
        except httpx.HTTPError as exc:
            log.error("osv.batch_error", error=str(exc))
            return []

        records: list[dict[str, Any]] = []
        for result in data.get("results", []):
            for vuln in result.get("vulns", []):
                records.append(_parse_advisory(vuln))
        return records


def _parse_advisory(vuln: dict[str, Any]) -> dict[str, Any]:
    severity = ""
    database_specific = vuln.get("database_specific", {})
    cvss = database_specific.get("cvss") or {}
    if isinstance(cvss, dict):
        score = cvss.get("score", 0)
        severity = "CRITICAL" if score >= 9 else "HIGH" if score >= 7 else "MEDIUM" if score >= 4 else "LOW"
    elif vuln.get("severity"):
        severity = vuln["severity"][0].get("score", "") if vuln["severity"] else ""

    return {
        "osv_id": vuln.get("id", ""),
        "summary": vuln.get("summary", ""),
        "details": (vuln.get("details", "") or "")[:2000],
        "severity": severity,
        "published": _parse_ts(vuln.get("published")),
        "modified": _parse_ts(vuln.get("modified")),
        "affected_packages": json.dumps(vuln.get("affected", [])),
        "aliases": vuln.get("aliases", []),
    }


def _parse_ts(val: str | None) -> datetime | None:
    if not val:
        return None
    try:
        return datetime.fromisoformat(val.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None
