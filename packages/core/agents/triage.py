"""
Triage Agent.

Takes raw incidents from the Investigation Agent, assigns severity using a
fixed rubric, deduplicates within a 7-day window, and returns a
priority-sorted list.

The 7-day dedup window spans across scans, not just within a single scan's
batch: when a `CoralEngine` instance is supplied (via the LangGraph node
binding in `agents/graph.py`), this node also queries `crowsnest_incidents`
— the same table `api.py` persists the running incident store to on every
scan — for incidents detected in the last 7 days, and reuses a matching
persisted incident's `id` instead of minting a new one. That lets the
caller's upsert-by-id logic (see `api.py`'s `/api/scan` handler) treat a
re-detected incident as an update rather than a brand-new duplicate.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING, Any

import structlog

from .state import AlertObject, CrowsnestState, Severity

if TYPE_CHECKING:
    from ..coral.engine import CoralEngine

log = structlog.get_logger(__name__)

_DEDUP_WINDOW = timedelta(days=7)

# Severity promotion rules: if any condition holds, bump severity one level.
# probability_of_compromise × exposure × runtime_multiplier
_SEVERITY_ORDER: list[Severity] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]


def _severity_score(severity: Severity) -> int:
    return _SEVERITY_ORDER.index(severity)


def _score_severity(incident: AlertObject) -> Severity:
    """
    Compute severity from first principles:
      base = pattern default
      × confidence boost
      × runtime confirmation multiplier
    """
    base_score = _severity_score(incident["severity"])
    confidence = incident["confidence"]
    runtime = incident["runtime_confirmation"]

    # Confidence < 0.4 → demote one level
    if confidence < 0.4:
        base_score = max(0, base_score - 1)
    # Confidence > 0.85 + runtime → promote one level
    if confidence > 0.85 and runtime:
        base_score = min(3, base_score + 1)
    # Large blast radius → promote one level
    if len(incident.get("blast_radius", [])) > 10:
        base_score = min(3, base_score + 1)

    return _SEVERITY_ORDER[base_score]


def _dedup_key(incident: AlertObject) -> str:
    """Stable key: (attack_pattern, sorted packages) — one incident per combo per 7 days."""
    pkgs = "|".join(sorted(incident.get("packages", [])))
    pattern = incident.get("attack_pattern", "")
    raw = f"{pattern}:{pkgs}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


async def _load_persisted_dedup_index(
    coral_engine: "CoralEngine",
) -> dict[str, AlertObject]:
    """
    Query `crowsnest_incidents` for incidents detected within the 7-day dedup
    window and return a dedup_key -> persisted AlertObject map (the highest-
    confidence persisted incident wins per key).

    Degrades gracefully (returns an empty index) if the table/query fails —
    this mirrors this codebase's convention of degrading to a no-op rather
    than failing the whole triage step when an optional data source is
    unavailable (e.g. missing API keys elsewhere already degrade to cached/
    seeded data rather than erroring).
    """
    index: dict[str, AlertObject] = {}
    try:
        rows = await coral_engine.query("SELECT id, data FROM crowsnest_incidents")
    except Exception as exc:  # pragma: no cover - defensive, mirrors codebase convention
        log.warning("triage.persisted_history_query_failed", error=str(exc))
        return index

    cutoff = datetime.now(timezone.utc) - _DEDUP_WINDOW
    for row in rows:
        try:
            persisted: AlertObject = json.loads(row["data"])
        except Exception:
            continue

        detected_at_raw = persisted.get("detected_at")
        if not detected_at_raw:
            continue
        try:
            detected_at = datetime.fromisoformat(detected_at_raw.replace("Z", "+00:00"))
        except ValueError:
            continue
        if detected_at.tzinfo is None:
            detected_at = detected_at.replace(tzinfo=timezone.utc)
        if detected_at < cutoff:
            continue  # outside the 7-day window — do not dedup against it

        key = _dedup_key(persisted)
        if key not in index or persisted.get("confidence", 0) > index[key].get("confidence", 0):
            index[key] = persisted

    return index


async def triage_node(
    state: CrowsnestState,
    coral_engine: "CoralEngine | None" = None,
    **_kwargs: Any,
) -> dict[str, Any]:
    """LangGraph node: deduplicate and re-score incidents."""
    incidents = state.get("incidents", [])
    if not incidents:
        log.info("triage.no_incidents")
        return {"triage_output": []}

    # Re-score severity
    rescored = []
    for inc in incidents:
        inc = dict(inc)  # shallow copy
        inc["severity"] = _score_severity(inc)  # type: ignore[arg-type]
        rescored.append(inc)

    # Deduplicate within this batch: keep highest-confidence incident per dedup key
    seen: dict[str, AlertObject] = {}
    for inc in rescored:
        key = _dedup_key(inc)
        if key not in seen or inc["confidence"] > seen[key]["confidence"]:
            seen[key] = inc  # type: ignore[assignment]

    # Cross-scan 7-day dedup window: if a persisted (DuckDB-backed) incident
    # with the same dedup key was detected within the last 7 days, reuse its
    # id so the caller's upsert-by-id logic updates it in place instead of
    # creating a duplicate active incident.
    if coral_engine is not None:
        persisted_index = await _load_persisted_dedup_index(coral_engine)
        reused = 0
        for key, inc in seen.items():
            match = persisted_index.get(key)
            if match is not None and match.get("id") and match["id"] != inc.get("id"):
                inc["id"] = match["id"]  # type: ignore[typeddict-item]
                inc["confidence"] = max(inc["confidence"], match.get("confidence", 0))  # type: ignore[typeddict-item]
                reused += 1
        if reused:
            log.info("triage.cross_scan_dedup_reused", count=reused)

    # Sort: severity DESC → confidence DESC → blast radius size DESC
    deduped = sorted(
        seen.values(),
        key=lambda i: (
            -_severity_score(i["severity"]),
            -i["confidence"],
            -len(i.get("blast_radius", [])),
        ),
    )

    log.info(
        "triage.complete",
        raw=len(incidents),
        deduped=len(deduped),
    )

    return {"triage_output": list(deduped)}
