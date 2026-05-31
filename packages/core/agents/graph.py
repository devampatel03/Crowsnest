"""
LangGraph state machine for Crowsnest.

         ┌──────────────────┐
         │ detection_planner│
         └────────┬─────────┘
                  │ emits pending_queries
         ┌────────▼─────────┐
         │  investigation   │  ← runs CoralDB queries
         └────────┬─────────┘
                  │ emits incidents
         ┌────────▼─────────┐
         │     triage       │  ← deduplicate + re-score
         └────────┬─────────┘
                  │ emits triage_output
         ┌────────▼─────────┐
         │   remediation    │  ← generate PR / Slack / ticket
         └────────┬─────────┘
                  │
                 END
"""

from __future__ import annotations

from functools import partial
from typing import Any

from langgraph.graph import END, StateGraph

from ..coral.engine import CoralEngine
from .detection_planner import detection_planner_node
from .investigation import investigation_node
from .remediation import remediation_node
from .state import CrowsnestState
from .triage import triage_node


def build_graph(
    coral_engine: CoralEngine,
    anthropic_api_key: str = "",
) -> Any:
    """
    Compile and return the Crowsnest LangGraph.

    Pass the compiled graph to `graph.ainvoke(initial_state)`.
    """
    graph = StateGraph(CrowsnestState)

    # Bind dependencies into each node
    planner = partial(
        detection_planner_node,
        anthropic_api_key=anthropic_api_key,
    )
    investigator = partial(
        investigation_node,
        coral_engine=coral_engine,
        anthropic_api_key=anthropic_api_key,
    )

    graph.add_node("detection_planner", planner)
    graph.add_node("investigation", investigator)
    graph.add_node("triage", triage_node)
    graph.add_node("remediation", remediation_node)

    graph.set_entry_point("detection_planner")
    graph.add_edge("detection_planner", "investigation")
    graph.add_edge("investigation", "triage")
    graph.add_edge("triage", "remediation")
    graph.add_edge("remediation", END)

    return graph.compile()


async def run_scan(
    coral_engine: CoralEngine,
    scan_context: dict[str, Any],
    anthropic_api_key: str = "",
) -> CrowsnestState:
    """
    Convenience wrapper — run a full Crowsnest scan and return the final state.

    Usage:
        result = await run_scan(
            coral_engine=engine,
            scan_context={
                "project_path": "/home/user/myapp",
                "ecosystem": "npm",
                "lockfile_path": None,
                "last_scan_ts": None,
                "recent_ioc_campaigns": ["shai-hulud-wave-4"],
                "github_org": "myorg",
            },
            anthropic_api_key="sk-ant-...",
        )
    """
    compiled = build_graph(coral_engine, anthropic_api_key)

    initial_state: CrowsnestState = {
        "messages": [],
        "scan_context": scan_context,  # type: ignore[typeddict-item]
        "pending_queries": [],
        "query_results": {},
        "incidents": [],
        "triage_output": [],
        "remediation_drafts": [],
        "token_usage": 0,
        "error": None,
    }

    return await compiled.ainvoke(initial_state)
