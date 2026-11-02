"""
Install-time veto: should this exact package version be installed right now?

The same checks serve `crowsnest install` and the pull-request check. Besides the registry heuristics that were
already here, a version is blocked when a public malware feed lists it, when its release changes look like a
hijack (RELEASE_ANOMALY), or when it is younger than the configured minimum release age. Every 2026 compromise in
the replay suite was removed from its registry within two and a half hours, so waiting two days keeps all of them
out. A lookup that cannot be made is reported in `degraded` and never counts as a clean result.
"""

from __future__ import annotations

import re
import time
import weakref
from datetime import UTC, datetime
from typing import Any

import duckdb
import httpx
import structlog

from .coral.engine import CoralEngine
from .ecosystems import normalize_ecosystem, normalize_package_name
from .queries.templates import RELEASE_CHECK_SQL
from .sources.ingestion import IngestorService
from .sources.osv import OSVSource

log = structlog.get_logger(__name__)

BLOCK_THRESHOLD = 0.6
_REFRESH_SECONDS = 600
_EXACT_VERSION = re.compile(r"^v?\d+(\.\d+){0,3}([-+][0-9A-Za-z.+-]+)?$")
# When each package's registry data was last refreshed, per database: a cache must never outlive its data.
_last_refresh: weakref.WeakKeyDictionary[CoralEngine, dict[tuple[str, str, str | None], float]] = weakref.WeakKeyDictionary()


def is_exact_version(spec: str | None) -> bool:
    """True for a single version (1.2.3, v1.2.3-rc.1), false for ranges and tags (^1.2, latest)."""
    return bool(spec and _EXACT_VERSION.match(spec.strip()))


async def evaluate(
    engine: CoralEngine,
    *,
    package: str,
    version: str | None = None,
    ecosystem: str = "npm",
    min_release_age_days: float = 2.0,
    live: bool = True,
    osv: OSVSource | None = None,
    ingestor: IngestorService | None = None,
) -> dict[str, Any]:
    """Veto verdict for one package version: {blocked, probability, signals, degraded, ...}."""
    eco = normalize_ecosystem(ecosystem) or ecosystem
    name = normalize_package_name(eco, package)
    signals: list[str] = []
    degraded: list[str] = []
    probability = 0.0
    hard_block = False

    if live:
        await _refresh(engine, eco, name, version if is_exact_version(version) else None,
                       ingestor or IngestorService(), degraded)

    meta = await engine.query(
        "SELECT * FROM packages WHERE ecosystem = :eco AND name = :pkg LIMIT 1", {"eco": eco, "pkg": name},
    )
    resolved = version if is_exact_version(version) else None
    if resolved is None and meta:
        resolved = meta[0].get("latest_version") or None

    # Check 1: registry metadata (age, downloads, repo). Unknown downloads are not "few downloads".
    if meta:
        pkg_data = meta[0]
        created_at = pkg_data.get("created_at")
        downloads = pkg_data.get("weekly_downloads")
        if created_at:
            created = created_at if isinstance(created_at, datetime) else _parse(created_at)
            if created:
                age_days = (_now() - _naive(created)).days
                if age_days < 30:
                    probability += 0.4
                    signals.append(f"Package registered {age_days} days ago (< 30 days)")
        if downloads is not None and downloads < 1000:
            probability += 0.3
            signals.append(f"Only {downloads:,} weekly downloads")
        if not pkg_data.get("repo_url"):
            probability += 0.2
            signals.append("No GitHub repository linked")
    else:
        probability += 0.2
        signals.append("Package not found in Crowsnest database (may be new)")

    # Check 2: known AI hallucination names.
    halluc = await engine.query("SELECT * FROM known_hallucination_patterns WHERE package = :pkg LIMIT 1", {"pkg": name})
    if halluc:
        conf = halluc[0].get("confidence", 0.8)
        probability += 0.3 * conf
        signals.append(f"Matches known AI hallucination pattern (confidence: {conf:.0%})")

    # Check 3: threat-campaign indicators by name.
    ioc = await engine.query(
        "SELECT * FROM shai_hulud_iocs WHERE ioc_type = 'package_name' AND value = :pkg LIMIT 1", {"pkg": name},
    )
    if ioc:
        probability = 1.0
        hard_block = True
        signals.append(f"ACTIVE IOC: {ioc[0].get('campaign_name')} — {ioc[0].get('attack_wave')}")

    # Check 4: Socket alerts.
    socket = await engine.query(
        "SELECT * FROM socket_alerts WHERE package = :pkg AND severity IN ('high', 'critical') LIMIT 1", {"pkg": name},
    )
    if socket:
        probability += 0.4
        signals.append(f"Socket.dev alert: {socket[0].get('alert_type')}")

    # Check 5: name close to a very popular package.
    popular = await engine.query(
        """
        SELECT name, weekly_downloads FROM packages
        WHERE ecosystem = :eco AND weekly_downloads > 1000000 AND name != :pkg
          AND LENGTH(name) BETWEEN LENGTH(:pkg) - 2 AND LENGTH(:pkg) + 2
        LIMIT 5
        """,
        {"eco": eco, "pkg": name},
    )
    for pop in popular:
        if levenshtein_approx(name, pop.get("name", "")) <= 2:
            probability += 0.35
            signals.append(f"Typosquat risk: similar to '{pop['name']}' ({pop.get('weekly_downloads', 0):,} downloads)")
            break

    # Check 6: is this exact version listed as malware?
    if resolved:
        known = await _malware_listing(engine, eco, name, resolved, live, osv, degraded)
        if known:
            probability = 1.0
            hard_block = True
            signals.insert(0, f"ACTIVE IOC: {name}@{resolved} is listed as malicious ({', '.join(known)})")

    # Check 7: does the release look hijacked?
    release_age_hours: float | None = None
    if resolved:
        try:
            release_rows = await engine.query(
                RELEASE_CHECK_SQL, {"ecosystem": eco, "pkg": name, "version": resolved}, strict=True,
            )
        except duckdb.Error:
            release_rows = []
            degraded.append("release check could not run: this version's changes were not compared with the last one")
        for row in release_rows:
            if row["score"] >= 3:
                probability += 0.6
                signals.append(
                    f"Release looks hijacked: {', '.join(row['signals'])} compared with the previous version",
                )
            if row.get("published_at"):
                release_age_hours = (_now() - _naive(row["published_at"])).total_seconds() / 3600

    # Check 8: minimum release age.
    too_new = False
    if release_age_hours is not None and min_release_age_days > 0 and release_age_hours < min_release_age_days * 24:
        too_new = True
        signals.append(
            f"Version {resolved} was published {_describe_age(release_age_hours)} ago; "
            f"policy is to wait {_describe_age(min_release_age_days * 24)}",
        )
    elif resolved and release_age_hours is None and live and meta:
        degraded.append("release date unknown: the registry did not report when this version was published")

    probability = min(probability, 1.0)
    blocked = probability >= BLOCK_THRESHOLD or hard_block or too_new
    return {
        "blocked": blocked,
        "package": package,
        "version": resolved or version,
        "ecosystem": eco,
        "probability": round(probability, 2),
        "signals": signals,
        "degraded": degraded,
        "release_age_hours": None if release_age_hours is None else round(release_age_hours, 1),
        "reason": signals[0] if signals else "No specific signals detected",
        "override_flag": "--crowsnest-acknowledge-risk" if blocked else None,
    }


async def _refresh(
    engine: CoralEngine, eco: str, name: str, version: str | None, ingestor: IngestorService, degraded: list[str],
) -> None:
    """Pull this package's registry data so a brand-new release is judged on what the registry says now.

    With a version, release details are collected for that version and its predecessor; without one, for the newest.
    """
    key = (eco, name, version)
    seen = _last_refresh.setdefault(engine, {})
    if time.monotonic() - seen.get(key, -_REFRESH_SECONDS) < _REFRESH_SECONDS:
        return
    try:
        await ingestor.ingest_registry_metadata(
            [(eco, name)], engine, focus={(eco, name): [version]} if version else None,
        )
        seen[key] = time.monotonic()
    except Exception as exc:
        log.warning("veto.refresh_failed", package=name, error=str(exc))
        degraded.append("registry data could not be refreshed")


async def _malware_listing(
    engine: CoralEngine, eco: str, name: str, version: str, live: bool, osv: OSVSource | None, degraded: list[str],
) -> list[str]:
    """Advisory ids that list this exact version as malicious (stored feed first, then a live lookup)."""
    rows = await engine.query(
        "SELECT sources FROM ossf_malicious_packages WHERE ecosystem = :eco AND package = :pkg AND version = :v",
        {"eco": eco, "pkg": name, "v": version},
    )
    if rows:
        return sorted({s for r in rows for s in (r.get("sources") or [])}) or ["malware feed"]
    if not live:
        return []
    try:
        found = await (osv or OSVSource()).find_malicious([(eco, name, version)])
    except (httpx.HTTPError, ValueError) as exc:
        log.warning("veto.feed_unreachable", error=str(exc))
        degraded.append("malware feed unreachable: this version could not be checked against known malware")
        return []
    matches = [r for r in found if r["_table"] == "ossf_malicious_packages"]
    if not matches:
        return []
    advisories = [
        {k: v for k, v in r.items() if k != "_table"} for r in found if r["_table"] == "osv_advisories"
    ]
    if advisories:
        await engine.ingest("osv_advisories", advisories)
    await engine.ingest("ossf_malicious_packages", [{k: v for k, v in r.items() if k != "_table"} for r in matches])
    return sorted({s for r in matches for s in r["sources"]})


def levenshtein_approx(a: str, b: str) -> int:
    """Approximate edit distance, only exact for differences of 3 or fewer."""
    if a == b:
        return 0
    if abs(len(a) - len(b)) > 3:
        return 99
    if a in b or b in a:
        return abs(len(a) - len(b))
    mismatches = sum(ca != cb for ca, cb in zip(a, b, strict=False))
    return mismatches + abs(len(a) - len(b))


def _describe_age(hours: float) -> str:
    return f"{hours:.0f} hours" if hours < 48 else f"{hours / 24:.0f} days"


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _naive(when: datetime) -> datetime:
    return when.astimezone(UTC).replace(tzinfo=None) if when.tzinfo else when


def _parse(value: str) -> datetime | None:
    try:
        return _naive(datetime.fromisoformat(value.replace("Z", "+00:00")))
    except ValueError:
        return None
