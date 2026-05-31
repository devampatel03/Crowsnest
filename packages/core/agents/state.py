"""LangGraph shared state for the Crowsnest agent pipeline."""

from __future__ import annotations

from typing import Annotated, Any, Literal, TypedDict

from langgraph.graph.message import add_messages

AttackPattern = Literal[
    "maintainer_takeover",
    "worm",
    "slopsquat",
    "slsa_poisoning",
    "sleeper",
    "identity_drift",
    "typosquat",
    "dep_confusion",
    "ioc_match",
    "ci_cache_poisoning",
    "oidc_misuse",
    "abandoned_popular",
]

Severity = Literal["CRITICAL", "HIGH", "MEDIUM", "LOW"]


class BlastRadiusEntry(TypedDict):
    project_path: str
    package: str
    version: str
    declared_in: str
    runtime_confirmed: bool


class AlertObject(TypedDict):
    id: str
    attack_pattern: AttackPattern
    confidence: float          # 0..1
    severity: Severity
    packages: list[str]
    blast_radius: list[BlastRadiusEntry]
    runtime_confirmation: bool
    remediation_options: list[str]
    raw_findings: list[dict[str, Any]]
    detected_at: str           # ISO-8601


class ScanContext(TypedDict):
    project_path: str
    ecosystem: str             # npm | pypi | cargo | go | maven
    lockfile_path: str | None
    last_scan_ts: str | None   # ISO-8601
    recent_ioc_campaigns: list[str]
    github_org: str | None


class RemediationDraft(TypedDict):
    incident_id: str
    pr_diff: str               # unified diff for pinning / swapping
    slack_message: str
    ticket_body: str
    postmortem_skeleton: str


class CrowsnestState(TypedDict):
    messages: Annotated[list, add_messages]
    scan_context: ScanContext
    pending_queries: list[str]             # query names from QueryLibrary to run
    query_results: dict[str, list[dict]]   # query_name -> rows
    incidents: list[AlertObject]
    triage_output: list[AlertObject]       # deduplicated, severity-sorted
    remediation_drafts: list[RemediationDraft]
    token_usage: int                       # running total for the demo punchline
    error: str | None
