"""
Remediation Drafter agent.

For each triaged incident, generates:
  - A PR diff (pinning / package swap)
  - A Slack message for the security channel
  - A Jira/Linear ticket body
  - A postmortem skeleton

Uses a simple template engine — no LLM call needed for standard patterns.
Complex cases fall back to claude-haiku-4-5.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

import structlog

from .state import AlertObject, AttackPattern, CrowsnestState, RemediationDraft

log = structlog.get_logger(__name__)


async def remediation_node(
    state: CrowsnestState,
    **_kwargs: Any,
) -> dict[str, Any]:
    """LangGraph node: generate remediation drafts for all triaged incidents."""
    incidents = state.get("triage_output", [])
    drafts: list[RemediationDraft] = []

    for inc in incidents:
        draft = _generate_draft(inc)
        drafts.append(draft)

    log.info("remediation.complete", drafts=len(drafts))
    return {"remediation_drafts": drafts}


def _generate_draft(incident: AlertObject) -> RemediationDraft:
    pattern: AttackPattern = incident["attack_pattern"]
    packages = incident.get("packages", [])
    severity = incident["severity"]
    confidence_pct = int(incident["confidence"] * 100)
    blast_count = len(incident.get("blast_radius", []))
    runtime = incident.get("runtime_confirmation", False)
    ts = incident.get("detected_at", datetime.now(timezone.utc).isoformat())

    pkg_list = "\n".join(f"  - {p}" for p in packages[:10])
    blast_list = "\n".join(
        f"  - {b['project_path']}: {b['package']}@{b['version']} ({b['declared_in']})"
        for b in incident.get("blast_radius", [])[:10]
    )

    # ── PR diff ──────────────────────────────────────────────────────────
    pr_diff = _make_pr_diff(pattern, packages, incident.get("blast_radius", []))

    # ── Slack message ────────────────────────────────────────────────────
    severity_emoji = {"CRITICAL": "🚨", "HIGH": "⛔", "MEDIUM": "⚠️", "LOW": "ℹ️"}[severity]
    slack_message = f"""{severity_emoji} *[{severity}] Supply Chain Alert — {_pattern_label(pattern)}*
*Packages:*\n{pkg_list or '  (see details)'}
*Confidence:* {confidence_pct}%
*Blast radius:* {blast_count} project(s) affected
*Runtime confirmed:* {'YES — actively loaded' if runtime else 'No'}
*Detected:* {ts}

Recommended actions:
""" + "\n".join(f"• {r}" for r in incident.get("remediation_options", [])[:3])

    # ── Ticket body ──────────────────────────────────────────────────────
    ticket_body = f"""## {_pattern_label(pattern)} — {severity}

**Detected:** {ts}
**Confidence:** {confidence_pct}%
**Runtime confirmed:** {'Yes' if runtime else 'No'}

### Affected packages
{pkg_list or '_None identified_'}

### Blast radius ({blast_count} projects)
{blast_list or '_No internal projects identified_'}

### Recommended remediation
""" + "\n".join(f"- [ ] {r}" for r in incident.get("remediation_options", []))

    # ── Postmortem skeleton ──────────────────────────────────────────────
    postmortem = f"""# Postmortem: {_pattern_label(pattern)}
**Date:** {ts[:10]}
**Severity:** {severity}
**Status:** OPEN

## Timeline
| Time | Event |
|------|-------|
| {ts} | Crowsnest detected anomaly |
| TBD  | Investigation started |
| TBD  | Remediation applied |
| TBD  | Incident resolved |

## Impact
- Packages affected: {', '.join(packages[:5])}
- Projects exposed: {blast_count}
- Runtime confirmed: {'Yes' if runtime else 'No'}

## Root cause
_TODO: Fill in after investigation_

## What went wrong
_TODO_

## What went right
- Crowsnest detection query: `{pattern.upper()}`

## Action items
""" + "\n".join(f"- [ ] {r}" for r in incident.get("remediation_options", []))

    return RemediationDraft(
        incident_id=incident["id"],
        pr_diff=pr_diff,
        slack_message=slack_message,
        ticket_body=ticket_body,
        postmortem_skeleton=postmortem,
    )


def _make_pr_diff(
    pattern: AttackPattern,
    packages: list[str],
    blast_radius: list[dict],
) -> str:
    if not packages:
        return "# No specific packages to pin"

    lines = [
        "# Crowsnest auto-generated pinning PR",
        "# Review each change before merging",
        "",
    ]
    for br in blast_radius[:5]:
        pkg = br.get("package", "")
        ver = br.get("version", "")
        proj = br.get("project_path", "")
        if pkg and ver:
            lines += [
                f"diff --git a/{proj}/package.json b/{proj}/package.json",
                "--- a/package.json",
                "+++ b/package.json",
                f"-    \"{pkg}\": \"^{ver}\"",
                f"+    \"{pkg}\": \"{ver}\"",
                "",
            ]
    return "\n".join(lines)


def _pattern_label(pattern: AttackPattern) -> str:
    labels: dict[AttackPattern, str] = {
        "maintainer_takeover": "Maintainer Takeover",
        "worm": "Token-Theft Worm",
        "slopsquat": "Slopsquatting (AI Hallucination)",
        "slsa_poisoning": "SLSA-Attested Malware",
        "sleeper": "Sleeper Dependency",
        "identity_drift": "Author Identity Drift",
        "typosquat": "Typosquatting",
        "dep_confusion": "Dependency Confusion",
        "ioc_match": "Active IOC Match",
        "ci_cache_poisoning": "CI Cache Poisoning",
        "oidc_misuse": "OIDC Token Misuse",
        "abandoned_popular": "Abandoned Popular Package",
    }
    return labels.get(pattern, pattern.replace("_", " ").title())
