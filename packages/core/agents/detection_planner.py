"""
Detection Planner agent.

Reads the scan context (project path, ecosystem, recent IOC feeds, last-scan
timestamp) and emits a prioritised ordered list of query names to run.
"""

from __future__ import annotations

import json
from typing import Any

import structlog

from ..llm import LLMClient, extract_json
from ..queries.templates import QueryLibrary
from .state import CrowsnestState, ScanContext

log = structlog.get_logger(__name__)

# All available query names in priority-first ordering within each category
_ALL_QUERIES = QueryLibrary.list_queries()
# Run on every scan, whatever a model plans: they need only lockfile and registry data.
_MANDATORY_QUERIES = ("MAINTAINER_REPUTATION", "MALICIOUS_PACKAGE_MATCH")

_SYSTEM_PROMPT = """\
You are Crowsnest's Detection Planner. Your job is to select and prioritise
SQL detection queries to run against a software project's supply chain.

You have access to the following named queries:
{query_list}

Given the scan context below, output a JSON array of query names in PRIORITY
ORDER (most important first). Select between 3 and 10 queries depending on
the signals present.

PRIORITISATION RULES:
1. If any recent IOC campaigns are listed → always include IOC_MATCH first.
2. If ecosystem is 'npm' → include SHAI_HULUD (worm bursts hit npm hardest).
3. If the project has been scanned before (last_scan_ts non-null) → include
   IDENTITY_DRIFT to catch account changes between scans.
4. If github_org is set → include XZ_PATTERN and SLSA_POISONING.
5. Always include SLOPSQUATTING if ai_authored_likelihood data may exist.
6. Include BLAST_RADIUS only when the user explicitly requests blast-radius
   analysis (scan_context.mode == 'blast_radius').
7. Never output a query name not in the provided list.
8. ALWAYS include MAINTAINER_REPUTATION — it scores every dependency maintainer
   and catches account-takeover and ghost-maintainer risks in any project.
9. ALWAYS include MALICIOUS_PACKAGE_MATCH — it finds exact versions that a public
   malware feed already lists as malicious, in every ecosystem.

Respond with ONLY a raw JSON array of strings, e.g.:
["IOC_MATCH", "SHAI_HULUD", "SLOPSQUATTING", "XZ_PATTERN", "MAINTAINER_REPUTATION"]
"""


async def detection_planner_node(
    state: CrowsnestState,
    *,
    llm: LLMClient | None = None,
) -> dict[str, Any]:
    """LangGraph node: emit a prioritised list of detection queries."""
    ctx: ScanContext = state["scan_context"]

    # No model configured: use the fixed ordering without a doomed network call.
    if llm is None:
        return {
            "pending_queries": _default_queries(ctx),
            "token_usage": state.get("token_usage", 0),
        }

    prompt = _SYSTEM_PROMPT.format(query_list=json.dumps(_ALL_QUERIES, indent=2))
    user_msg = json.dumps({
        "project_path": ctx.get("project_path", ""),
        "ecosystem": ctx.get("ecosystem", "npm"),
        "last_scan_ts": ctx.get("last_scan_ts"),
        "recent_ioc_campaigns": ctx.get("recent_ioc_campaigns", []),
        "github_org": ctx.get("github_org"),
    })

    try:
        response = await llm.complete(system=prompt, user=user_msg, max_tokens=512)
        # Tolerates code fences and chatty replies, which smaller and local models produce more often.
        queries = extract_json(response.text, want=(list,))
        # Validate — only return names that actually exist
        valid_queries = [q for q in queries if q in _ALL_QUERIES]

        # These checks are always mandatory — append any the LLM didn't pick
        for required in _MANDATORY_QUERIES:
            if required not in valid_queries:
                valid_queries.append(required)

        token_delta = response.total_tokens
        log.info(
            "detection_planner.complete",
            queries=valid_queries,
            tokens=token_delta,
        )
    except Exception as exc:
        log.error("detection_planner.error", error=str(exc))
        # Fall back to a sensible default ordering
        valid_queries = _default_queries(ctx)
        token_delta = 0

    return {
        "pending_queries": valid_queries,
        "token_usage": state.get("token_usage", 0) + token_delta,
    }


def _default_queries(ctx: ScanContext) -> list[str]:
    """Deterministic fallback when the LLM call fails."""
    # MAINTAINER_REPUTATION is always included: it needs only lockfile and registry data.
    queries = [
        "MALICIOUS_PACKAGE_MATCH", "MAINTAINER_REPUTATION", "IOC_MATCH", "SLOPSQUATTING", "SHAI_HULUD",
        "ABANDONED_POPULAR", "TYPOSQUAT_DISTANCE",
    ]
    if ctx.get("github_org"):
        queries += ["XZ_PATTERN", "SLSA_POISONING", "OIDC_TOKEN_MISUSE"]
    if ctx.get("recent_ioc_campaigns"):
        queries = ["IOC_MATCH"] + [q for q in queries if q != "IOC_MATCH"]
    return queries
