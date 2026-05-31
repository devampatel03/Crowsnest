"""
Triage Agent.

Takes raw incidents from the Investigation Agent, assigns severity using a
fixed rubric, deduplicates within a 7-day window, and returns a
priority-sorted list.
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone
from typing import Any

import structlog

from .state import AlertObject, CrowsnestState, Severity

log = structlog.get_logger(__name__)

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


async def triage_node(
    state: CrowsnestState,
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

    # Deduplicate: keep highest-confidence incident per dedup key
    seen: dict[str, AlertObject] = {}
    for inc in rescored:
        key = _dedup_key(inc)
        if key not in seen or inc["confidence"] > seen[key]["confidence"]:
            seen[key] = inc  # type: ignore[assignment]

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
