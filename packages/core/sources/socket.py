"""
Socket.dev API adapter.

Fetches per-package behavioural risk scores and alert types.
Gracefully returns empty if no API key is configured.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

import httpx
import structlog

from .base import DataSource

log = structlog.get_logger(__name__)

_SOCKET_API = "https://api.socket.dev/v0"

# Alert types we care about for supply chain attacks
_CRITICAL_ALERT_TYPES = {
    "shellEscape", "networkInInstall", "envVarExfil",
    "malware", "reverseDep", "obfuscatedFile",
    "typosquatDetected", "suspiciousPackage",
}


class SocketSource(DataSource):
    name = "socket"
    tables = ["socket_alerts"]

    def __init__(self, api_key: str = ""):
        self._api_key = api_key
        self._semaphore = asyncio.Semaphore(10)

    def _client(self) -> httpx.AsyncClient:
        headers = {"User-Agent": "crowsnest/0.1 (supply-chain-security)"}
        if self._api_key:
            import base64
            encoded = base64.b64encode(f"{self._api_key}:".encode()).decode()
            headers["Authorization"] = f"Basic {encoded}"
        return httpx.AsyncClient(headers=headers, timeout=httpx.Timeout(30.0))

    async def fetch(self, ecosystem: str = "npm", package: str = "", version: str = "", **kwargs: Any) -> list[dict[str, Any]]:
        if not self._api_key:
            log.debug("socket.no_api_key")
            return []
        if package:
            return await self.fetch_package_score(ecosystem, package, version or None)
        return []

    async def fetch_package_score(
        self,
        ecosystem: str,
        package: str,
        version: str | None = None,
    ) -> list[dict[str, Any]]:
        if not self._api_key:
            return []

        # Encode scoped packages: @org/pkg → @org%2Fpkg
        encoded_pkg = package.replace("/", "%2F")
        url = f"{_SOCKET_API}/{ecosystem}/scores/{encoded_pkg}"
        if version:
            url += f"/{version}"

        async with self._semaphore:
            try:
                async with self._client() as client:
                    resp = await client.get(url)
                    if resp.status_code in (404, 402):
                        return []
                    resp.raise_for_status()
                    data = resp.json()
            except httpx.HTTPError as exc:
                log.error("socket.fetch_error", package=package, error=str(exc))
                return []

        alerts = []
        # Socket API v0 returns a 'score' object with 'alerts' list
        for alert in data.get("score", {}).get("alerts", []):
            alert_type = alert.get("type", "")
            alerts.append({
                "package": package,
                "ecosystem": ecosystem,
                "version": version or data.get("version", ""),
                "alert_type": alert_type,
                "severity": _infer_severity(alert_type, alert),
                "description": alert.get("message", ""),
                "first_seen": datetime.now(timezone.utc),
            })

        return alerts

    async def fetch_batch_scores(self, packages: list[tuple[str, str, str]]) -> list[dict[str, Any]]:
        """Batch fetch scores for (ecosystem, package, version) tuples."""
        if not self._api_key:
            return []

        tasks = [
            self.fetch_package_score(eco, pkg, ver)
            for eco, pkg, ver in packages
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        records: list[dict[str, Any]] = []
        for r in results:
            if isinstance(r, list):
                records.extend(r)
        return records


def _infer_severity(alert_type: str, alert: dict[str, Any]) -> str:
    if alert_type in ("malware", "networkInInstall", "envVarExfil"):
        return "critical"
    if alert_type in ("shellEscape", "obfuscatedFile", "typosquatDetected"):
        return "high"
    return alert.get("severity", "medium")
