"""
OSV.dev malicious-package adapter.

OSV republishes the OpenSSF malicious-packages feed as `MAL-` advisories, usually within minutes of a report. They
are the quickest public signal that a published version is hostile. OSV does the version matching, so each
(ecosystem, package, version) from a lockfile is asked about exactly; asking by package name alone would flag every
safe version too. Ordinary vulnerabilities (GHSA, PYSEC...) are ignored here: this is about packages that are malware.
"""

from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime
from typing import Any

import httpx
import structlog

from ..ecosystems import normalize_ecosystem, normalize_package_name, osv_ecosystem
from .base import DataSource

log = structlog.get_logger(__name__)

_OSV_API = "https://api.osv.dev/v1"
_BATCH_SIZE = 500
_MAX_PAGES = 10
_DETAIL_CONCURRENCY = 8
_MALWARE_PREFIX = "MAL-"


class OSVSource(DataSource):
    name = "osv"
    tables = ["osv_advisories", "ossf_malicious_packages"]

    def __init__(self, transport: httpx.AsyncBaseTransport | None = None):
        self._transport = transport
        self._client_opts: dict[str, Any] = {
            "headers": {"User-Agent": "crowsnest/0.1 (supply-chain-security)"},
            "timeout": httpx.Timeout(30.0, read=60.0),
        }

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=self._transport, **self._client_opts)

    async def fetch(self, ecosystem: str = "", package: str = "", version: str = "", **kwargs: Any) -> list[dict[str, Any]]:
        if ecosystem and package and version:
            return await self.find_malicious([(ecosystem, package, version)])
        return []

    async def find_malicious(self, packages: list[tuple[str, str, str]]) -> list[dict[str, Any]]:
        """Records for every (ecosystem, package, version) that OSV lists as malicious.

        `packages` holds canonical ecosystem names. Returns `ossf_malicious_packages` rows plus the
        `osv_advisories` rows that explain them. A network failure raises: it must not read as "all clear".
        """
        queries: list[tuple[str, str, str]] = []
        seen: set[tuple[str, str, str]] = set()
        for eco_raw, name, version in packages:
            eco = normalize_ecosystem(eco_raw)
            if not (eco and osv_ecosystem(eco) and name and version):
                continue
            key = (eco, normalize_package_name(eco, name), version)
            if key not in seen:
                seen.add(key)
                queries.append(key)
        if not queries:
            return []

        async with self._client() as client:
            hits: dict[tuple[str, str, str], set[str]] = {}
            for start in range(0, len(queries), _BATCH_SIZE):
                chunk = queries[start:start + _BATCH_SIZE]
                for key, ids in await self._query_batch(client, chunk):
                    hits.setdefault(key, set()).update(ids)
            advisories = await self._advisory_details(client, {i for ids in hits.values() for i in ids})

        records: list[dict[str, Any]] = []
        for adv in advisories.values():
            records.append({"_table": "osv_advisories", **adv})
        for (eco, name, version), ids in hits.items():
            first_reported = min(
                (p for p in (advisories.get(i, {}).get("published") for i in ids) if p), default=None,
            )
            records.append({
                "_table": "ossf_malicious_packages",
                "ecosystem": eco,
                "package": name,
                "version": version,
                "classification": "malicious",
                "ioc_hashes": [],
                "first_reported": first_reported or datetime.now(UTC).replace(tzinfo=None),
                "sources": sorted(ids),
            })
        log.info("osv.malware_matches", queried=len(queries), malicious=len(hits))
        return records

    async def _query_batch(
        self, client: httpx.AsyncClient, chunk: list[tuple[str, str, str]],
    ) -> list[tuple[tuple[str, str, str], set[str]]]:
        """Malware ids per query in `chunk`, following OSV's result pages."""
        results: list[tuple[tuple[str, str, str], set[str]]] = []
        pending = [(key, None) for key in chunk]
        for _ in range(_MAX_PAGES):
            if not pending:
                break
            payload = {"queries": [
                {"package": {"name": name, "ecosystem": osv_ecosystem(eco)}, "version": version,
                 **({"page_token": token} if token else {})}
                for (eco, name, version), token in pending
            ]}
            resp = await client.post(f"{_OSV_API}/querybatch", json=payload)
            resp.raise_for_status()
            answers = resp.json().get("results", [])
            if len(answers) != len(pending):
                raise ValueError("OSV returned a different number of results than queries")
            next_pending = []
            for (key, _token), answer in zip(pending, answers, strict=True):
                ids = {v["id"] for v in answer.get("vulns", []) if str(v.get("id", "")).startswith(_MALWARE_PREFIX)}
                if ids:
                    results.append((key, ids))
                if answer.get("next_page_token"):
                    next_pending.append((key, answer["next_page_token"]))
            pending = next_pending
        else:
            if pending:
                log.warning("osv.pages_truncated", remaining=len(pending))
        return results

    async def _advisory_details(self, client: httpx.AsyncClient, ids: set[str]) -> dict[str, dict[str, Any]]:
        """Full advisory per id. One that cannot be fetched is skipped: the match itself is kept."""
        semaphore = asyncio.Semaphore(_DETAIL_CONCURRENCY)

        async def one(osv_id: str) -> tuple[str, dict[str, Any] | None]:
            async with semaphore:
                try:
                    resp = await client.get(f"{_OSV_API}/vulns/{osv_id}")
                    resp.raise_for_status()
                    return osv_id, _parse_advisory(resp.json())
                except (httpx.HTTPError, ValueError) as exc:
                    log.warning("osv.detail_error", id=osv_id, error=str(exc))
                    return osv_id, None

        fetched = await asyncio.gather(*[one(i) for i in sorted(ids)])
        return {i: adv for i, adv in fetched if adv}


def _parse_advisory(vuln: dict[str, Any]) -> dict[str, Any]:
    severity = ""
    database_specific = vuln.get("database_specific", {})
    cvss = database_specific.get("cvss") or {}
    if isinstance(cvss, dict) and cvss:
        score = cvss.get("score", 0)
        severity = "CRITICAL" if score >= 9 else "HIGH" if score >= 7 else "MEDIUM" if score >= 4 else "LOW"
    elif str(vuln.get("id", "")).startswith(_MALWARE_PREFIX):
        severity = "CRITICAL"
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
        parsed = datetime.fromisoformat(val.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None
    return parsed.astimezone(UTC).replace(tzinfo=None) if parsed.tzinfo else parsed
