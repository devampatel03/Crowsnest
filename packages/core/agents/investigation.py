"""
Investigation Agent.

Runs each query from pending_queries via CoralDB, then for each hit runs
follow-up queries to produce a structured AlertObject with blast radius,
runtime confirmation, and confidence score.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

import structlog
from anthropic import AsyncAnthropic
from langchain_core.tools import tool

from ..coral.engine import CoralEngine
from ..queries.templates import QueryLibrary
from .state import AlertObject, AttackPattern, BlastRadiusEntry, CrowsnestState, Severity

log = structlog.get_logger(__name__)

_SYSTEM_PROMPT = """\
You are Crowsnest's Investigation Agent. You have one tool: coral_query(sql).

Your task: given SQL query results (raw findings), produce a structured
incident object for EACH distinct package/pattern combination found.

For each incident you MUST determine:
- attack_pattern: one of maintainer_takeover | worm | slopsquat | slsa_poisoning |
  sleeper | identity_drift | typosquat | dep_confusion | ioc_match |
  ci_cache_poisoning | oidc_misuse | abandoned_popular
- confidence: 0..1 (how certain based only on the data — never speculate)
- severity: CRITICAL | HIGH | MEDIUM | LOW
  * CRITICAL: active IOC match or runtime-confirmed exploitation
  * HIGH: strong multi-signal correlation (≥3 signals)
  * MEDIUM: moderate evidence (2 signals)
  * LOW: weak single signal
- blast_radius: which of our projects use the affected package
- runtime_confirmation: true only if runtime_imports table shows the package loaded
- remediation_options: a list of 2-4 strings detailing recommended specific mitigation steps, tailored to the exact findings (do NOT output objects, just plain strings)

STRICT RULES:
- Never speculate beyond what SQL returns.
- If a follow-up query returns zero rows, the signal is absent — do not infer.
- If confidence < 0.3, do not emit an incident.
- Output valid JSON only — a list of incident objects.
"""

# Map query names to their likely attack patterns
_QUERY_PATTERN_MAP: dict[str, AttackPattern] = {
    "XZ_PATTERN": "maintainer_takeover",
    "SHAI_HULUD": "worm",
    "SLOPSQUATTING": "slopsquat",
    "SLSA_POISONING": "slsa_poisoning",
    "BLAST_RADIUS": "maintainer_takeover",
    "SLEEPER_DEPENDENCY": "sleeper",
    "IDENTITY_DRIFT": "identity_drift",
    "TYPOSQUAT_DISTANCE": "typosquat",
    "ABANDONED_POPULAR": "abandoned_popular",
    "OIDC_TOKEN_MISUSE": "oidc_misuse",
    "DEP_CONFUSION": "dep_confusion",
    "CI_CACHE_POISONING": "ci_cache_poisoning",
    "IOC_MATCH": "ioc_match",
    "MAINTAINER_REPUTATION": "maintainer_takeover",
}

_SEVERITY_BY_PATTERN: dict[AttackPattern, Severity] = {
    "ioc_match": "CRITICAL",
    "worm": "CRITICAL",
    "slsa_poisoning": "CRITICAL",
    "maintainer_takeover": "HIGH",
    "sleeper": "HIGH",
    "ci_cache_poisoning": "HIGH",
    "oidc_misuse": "HIGH",
    "dep_confusion": "MEDIUM",
    "identity_drift": "MEDIUM",
    "typosquat": "MEDIUM",
    "slopsquat": "MEDIUM",
    "abandoned_popular": "LOW",
}


async def investigation_node(
    state: CrowsnestState,
    *,
    coral_engine: CoralEngine,
    anthropic_api_key: str = "",
) -> dict[str, Any]:
    """LangGraph node: run detection queries and produce AlertObjects."""
    pending = state.get("pending_queries", [])
    query_results: dict[str, list[dict]] = {}
    incidents: list[AlertObject] = []
    total_tokens = state.get("token_usage", 0)

    for query_name in pending:
        try:
            sql = QueryLibrary.get(query_name, _default_params(query_name))
        except KeyError:
            log.warning("investigation.unknown_query", name=query_name)
            continue

        rows = await coral_engine.query(sql)
        query_results[query_name] = rows

        if not rows:
            continue

        log.info("investigation.query_hit", query=query_name, rows=len(rows))

        # For significant hits, ask the LLM to classify and structure them
        if len(rows) > 0 and anthropic_api_key:
            new_incidents, tokens = await _classify_findings(
                query_name=query_name,
                rows=rows[:20],  # cap context to control token usage
                coral_engine=coral_engine,
                api_key=anthropic_api_key,
            )
            incidents.extend(new_incidents)
            total_tokens += tokens
        else:
            # Deterministic fallback: synthesise incidents without LLM
            incidents.extend(_synthesize_incidents(query_name, rows))

    log.info(
        "investigation.complete",
        queries_run=len(pending),
        incidents_found=len(incidents),
        total_tokens=total_tokens,
    )

    # Enrich blast_radius for incidents that have packages but no blast radius yet
    if incidents:
        incidents = await _enrich_blast_radius(incidents, coral_engine)

    return {
        "query_results": query_results,
        "incidents": incidents,
        "token_usage": total_tokens,
    }


async def _classify_findings(
    query_name: str,
    rows: list[dict[str, Any]],
    coral_engine: CoralEngine,
    api_key: str,
) -> tuple[list[AlertObject], int]:
    """Use the LLM to classify findings into structured AlertObjects."""
    client = AsyncAnthropic(api_key=api_key)

    # Build context for the LLM
    context = {
        "query_name": query_name,
        "expected_pattern": _QUERY_PATTERN_MAP.get(query_name, "unknown"),
        "findings": rows,
    }

    try:
        response = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=2048,
            system=_SYSTEM_PROMPT,
            messages=[{
                "role": "user",
                "content": json.dumps(context, default=str),
            }],
        )
        text = response.content[0].text.strip()
        # Find the first JSON array to avoid 'Extra data' errors if Claude adds conversational text
        import re
        match = re.search(r'\[\s*\{.*\}\s*\]', text, re.DOTALL)
        if match:
            text = match.group(0)
        else:
            # Fallback if it returned a single object instead of an array
            match = re.search(r'\{.*\}', text, re.DOTALL)
            if match:
                text = match.group(0)
        
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            parsed = [parsed]

        incidents = [_dict_to_alert(d, rows) for d in parsed if d.get("confidence", 0) >= 0.3]
        log.info("investigation.llm_classified", query=query_name, count=len(incidents), raw_responses=len(parsed), used_llm=True)
        tokens = response.usage.input_tokens + response.usage.output_tokens
        return incidents, tokens

    except Exception as exc:
        log.error("investigation.classify_error", query=query_name, error=str(exc))
        return _synthesize_incidents(query_name, rows), 0


def _synthesize_incidents(query_name: str, rows: list[dict[str, Any]]) -> list[AlertObject]:
    """Deterministic incident synthesis — used when no API key or LLM call fails."""
    if not rows:
        return []

    pattern = _QUERY_PATTERN_MAP.get(query_name, "ioc_match")
    severity = _SEVERITY_BY_PATTERN.get(pattern, "MEDIUM")

    packages: set[str] = set()
    for r in rows:
        # packages_list may be a JSON string (DuckDB TEXT[] coercion) or a real list
        raw_list = r.get("packages_list") or r.get("our_packages_affected")
        if raw_list:
            if isinstance(raw_list, str):
                try:
                    import json as _json
                    parsed = _json.loads(raw_list)
                    if isinstance(parsed, list):
                        packages.update(str(p) for p in parsed if p)
                except Exception:
                    packages.add(raw_list)
            elif isinstance(raw_list, list):
                packages.update(str(p) for p in raw_list if p)
        else:
            pkg = r.get("package") or r.get("name") or r.get("installed_package")
            if pkg:
                packages.add(pkg)

    packages.discard("unknown")
    packages_list = list(packages) or ["unknown"]

    blast = []
    for r in rows:
        if r.get("our_project") or r.get("project_path"):
            blast.append(BlastRadiusEntry(
                project_path=r.get("our_project") or r.get("project_path", ""),
                package=r.get("affected_dep") or r.get("package", ""),
                version=r.get("version", ""),
                declared_in=r.get("declared_in", "transitive"),
                runtime_confirmed=r.get("runtime_status", "not_observed_at_runtime") != "not_observed_at_runtime",
            ))

    runtime_confirmed = any(
        r.get("runtime_status", "not_observed_at_runtime") != "not_observed_at_runtime"
        for r in rows
    )

    confidence = min(0.9, 0.5 + len(rows) * 0.02)  # floor at 0.5 so triage doesn't demote
    if pattern == "ioc_match":
        confidence = 0.95
    elif pattern == "worm" and len(rows) > 5:
        confidence = 0.90
    elif pattern == "maintainer_takeover":
        # IOC-flagged maintainers are high-confidence
        ioc_count = sum(1 for r in rows if r.get("ioc_flagged"))
        if ioc_count > 0:
            confidence = min(0.95, 0.7 + ioc_count * 0.05)

    return [AlertObject(
        id=str(uuid.uuid4()),
        attack_pattern=pattern,
        confidence=confidence,
        severity=severity,
        packages=packages_list[:20],
        blast_radius=blast[:50],
        runtime_confirmation=runtime_confirmed,
        remediation_options=_default_remediations(pattern),
        raw_findings=rows[:10],
        detected_at=datetime.now(timezone.utc).isoformat(),
    )]


async def _enrich_blast_radius(
    incidents: list[AlertObject],
    coral_engine: CoralEngine,
) -> list[AlertObject]:
    """
    For incidents that have packages but empty blast_radius,
    look up affected projects in local_lockfiles.
    """
    enriched: list[AlertObject] = []
    for inc in incidents:
        # TypedDict — work with it as a plain dict; do NOT call AlertObject(**inc_dict)
        inc_dict: dict[str, Any] = dict(inc)
        if inc_dict.get("packages") and not inc_dict.get("blast_radius"):
            packages = inc_dict["packages"][:15]
            # Build parameterised WHERE clause (DuckDB named params)
            params: dict[str, Any] = {}
            conditions: list[str] = []
            for i, pkg in enumerate(packages):
                key = f"pkg_{i}"
                params[key] = pkg
                conditions.append(f"package = :{key}")

            if conditions:
                where_clause = " OR ".join(conditions)
                try:
                    rows = await coral_engine.query(
                        f"""
                        SELECT DISTINCT project_path, package, version, declared_in
                        FROM local_lockfiles
                        WHERE {where_clause}
                        LIMIT 50
                        """,
                        params,
                    )
                    blast: list[BlastRadiusEntry] = [
                        BlastRadiusEntry(
                            project_path=r["project_path"],
                            package=r["package"],
                            version=r.get("version", ""),
                            declared_in=r.get("declared_in", "transitive"),
                            runtime_confirmed=False,
                        )
                        for r in rows
                    ]
                    inc_dict["blast_radius"] = blast
                except Exception as exc:
                    log.warning("investigation.enrich_blast_radius_error", error=str(exc))
        # Cast back — TypedDict is just a dict at runtime
        enriched.append(inc_dict)  # type: ignore[arg-type]
    return enriched


def _dict_to_alert(d: dict[str, Any], raw: list[dict[str, Any]]) -> AlertObject:
    pattern: AttackPattern = d.get("attack_pattern", "ioc_match")
    
    # Sanitize packages to always be a list of strings
    pkgs_raw = d.get("packages", [])
    if isinstance(pkgs_raw, list):
        packages = [str(p) for p in pkgs_raw if p]
    elif isinstance(pkgs_raw, str):
        packages = [pkgs_raw]
    else:
        packages = []

    # Sanitize blast_radius to always be a list of dicts (BlastRadiusEntry)
    blast_raw = d.get("blast_radius", [])
    blast_radius = []
    if isinstance(blast_raw, list):
        for item in blast_raw:
            if isinstance(item, dict):
                entry = {
                    "project_path": str(item.get("project_path", "")),
                    "package": str(item.get("package", "") or (packages[0] if packages else "")),
                    "version": str(item.get("version", "")),
                    "declared_in": str(item.get("declared_in", "transitive")),
                    "runtime_confirmed": bool(item.get("runtime_confirmed", False)),
                }
                blast_radius.append(entry)
            elif isinstance(item, str):
                blast_radius.append({
                    "project_path": item,
                    "package": packages[0] if packages else "",
                    "version": "",
                    "declared_in": "transitive",
                    "runtime_confirmed": False,
                })

    return AlertObject(
        id=str(uuid.uuid4()),
        attack_pattern=pattern,
        confidence=float(d.get("confidence", 0.5)),
        severity=d.get("severity", _SEVERITY_BY_PATTERN.get(pattern, "MEDIUM")),
        packages=packages,
        blast_radius=blast_radius,
        runtime_confirmation=bool(d.get("runtime_confirmation", False)),
        remediation_options=d.get("remediation_options", _default_remediations(pattern)),
        raw_findings=raw[:10],
        detected_at=datetime.now(timezone.utc).isoformat(),
    )



def _default_remediations(pattern: AttackPattern) -> list[str]:
    _map: dict[AttackPattern, list[str]] = {
        "maintainer_takeover": [
            "Pin to last known-safe version before maintainer change",
            "Audit recent commits from new maintainer",
            "Consider vendoring the package",
            "File a GitHub security advisory",
        ],
        "worm": [
            "Remove package immediately",
            "Rotate all secrets that may have been exfiltrated",
            "Audit all packages published by the same account",
            "Check CI/CD logs for exfiltration attempts",
        ],
        "slopsquat": [
            "Verify the package was intentionally added",
            "Check if a legitimate package of this name exists",
            "Remove if unintended; pin if intentional",
            "Add to internal allow-list after verification",
        ],
        "slsa_poisoning": [
            "Pin to an attested version from a known-safe build",
            "Verify build invocation ID against GitHub Actions logs manually",
            "File a security advisory with the package maintainer",
            "Temporarily vendor the package from source",
        ],
        "sleeper": [
            "Remove or pin to previous version without install script",
            "Audit the install script content for malicious code",
            "Check network traffic during npm install",
        ],
        "identity_drift": [
            "Contact the maintainer via an out-of-band channel to verify identity",
            "Pin to pre-drift version",
            "Monitor subsequent commits closely",
        ],
        "typosquat": [
            "Verify the intended package name",
            "Remove the typosquatted package",
            "Install the correct package",
        ],
        "dep_confusion": [
            "Verify resolved URL — should point to private registry",
            "Add scope to .npmrc with registry override",
            "Remove and reinstall from correct registry",
        ],
        "ioc_match": [
            "Remove the package immediately",
            "Rotate all secrets in the affected environment",
            "Scan CI logs for exfiltration traffic",
            "File a security incident report",
        ],
        "ci_cache_poisoning": [
            "Audit cached build artefacts for tampering",
            "Invalidate all CI caches in affected repos",
            "Pin to content-addressed cache keys",
        ],
        "oidc_misuse": [
            "Restrict OIDC token audience to specific repos/branches",
            "Audit what secrets the token was used to access",
            "Rotate affected cloud credentials",
        ],
        "abandoned_popular": [
            "Evaluate a maintained fork or alternative",
            "Vendor the package at the last known-good version",
            "Pin to specific version to prevent accidental upgrades",
        ],
    }
    return _map.get(pattern, ["Investigate further", "Pin to current version"])


def _default_params(query_name: str) -> dict[str, Any]:
    defaults: dict[str, dict[str, Any]] = {
        "XZ_PATTERN": {"lookback_new_days": "180"},
        "SHAI_HULUD": {"lookback_days": "7"},
        "SLOPSQUATTING": {
            "min_ai_likelihood": 0.7,
            "max_age_days": "120",
            "max_downloads": 5000,
        },
        "SLEEPER_DEPENDENCY": {"lookback_days": "30"},
    }
    return defaults.get(query_name, {})
