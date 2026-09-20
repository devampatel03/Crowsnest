"""
Tests for the deterministic fallback paths of the LangGraph agent nodes:

- detection_planner.py's `_default_queries()` and `detection_planner_node`
  (falls back when the Anthropic API call raises).
- investigation.py's `_synthesize_incidents()` (falls back when no API key
  is provided or the LLM classification call raises).

These fallbacks are what keep Crowsnest scans working when Socket.dev,
GitHub, or Anthropic API keys are missing/misbehaving (see CLAUDE.md
"Conventions & gotchas").
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from packages.core.agents.detection_planner import _default_queries, detection_planner_node
from packages.core.agents.investigation import _synthesize_incidents
from packages.core.queries.templates import QueryLibrary


# ── detection_planner._default_queries ──────────────────────────────────────


class TestDefaultQueries:
    def test_baseline_queries_always_present(self):
        ctx = {"project_path": "/tmp/proj", "ecosystem": "npm"}
        queries = _default_queries(ctx)
        for expected in (
            "MAINTAINER_REPUTATION",
            "IOC_MATCH",
            "SLOPSQUATTING",
            "SHAI_HULUD",
            "ABANDONED_POPULAR",
            "TYPOSQUAT_DISTANCE",
        ):
            assert expected in queries

    def test_all_returned_query_names_are_valid(self):
        ctx = {"project_path": "/tmp/proj", "ecosystem": "npm", "github_org": "acme",
               "recent_ioc_campaigns": ["shai-hulud-wave-3"]}
        queries = _default_queries(ctx)
        valid = set(QueryLibrary.list_queries())
        for q in queries:
            assert q in valid

    def test_github_org_adds_supply_chain_provenance_queries(self):
        ctx = {"project_path": "/tmp/proj", "ecosystem": "npm", "github_org": "acme"}
        queries = _default_queries(ctx)
        assert "XZ_PATTERN" in queries
        assert "SLSA_POISONING" in queries
        assert "OIDC_TOKEN_MISUSE" in queries

    def test_no_github_org_omits_provenance_queries(self):
        ctx = {"project_path": "/tmp/proj", "ecosystem": "npm"}
        queries = _default_queries(ctx)
        assert "XZ_PATTERN" not in queries
        assert "SLSA_POISONING" not in queries

    def test_recent_ioc_campaigns_moves_ioc_match_to_front(self):
        ctx = {
            "project_path": "/tmp/proj",
            "ecosystem": "npm",
            "recent_ioc_campaigns": ["shai-hulud-wave-3"],
        }
        queries = _default_queries(ctx)
        assert queries[0] == "IOC_MATCH"

    def test_no_ioc_campaigns_ioc_match_still_present_but_not_forced_first(self):
        ctx = {"project_path": "/tmp/proj", "ecosystem": "npm", "recent_ioc_campaigns": []}
        queries = _default_queries(ctx)
        assert "IOC_MATCH" in queries


# ── detection_planner_node falling back on Anthropic failure ────────────────


class TestDetectionPlannerNodeFallback:
    @pytest.mark.asyncio
    async def test_node_falls_back_to_default_queries_on_anthropic_error(self):
        state = {
            "scan_context": {
                "project_path": "/tmp/proj",
                "ecosystem": "npm",
                "lockfile_path": None,
                "last_scan_ts": None,
                "recent_ioc_campaigns": [],
                "github_org": None,
            },
            "token_usage": 0,
        }

        with patch("packages.core.agents.detection_planner.AsyncAnthropic") as mock_cls:
            mock_client = AsyncMock()
            mock_client.messages.create.side_effect = RuntimeError("API unreachable")
            mock_cls.return_value = mock_client

            result = await detection_planner_node(state, anthropic_api_key="fake-key")

        expected = _default_queries(state["scan_context"])
        assert result["pending_queries"] == expected
        assert result["token_usage"] == 0


# ── investigation._synthesize_incidents ──────────────────────────────────────


class TestSynthesizeIncidents:
    def test_empty_rows_returns_empty_list(self):
        assert _synthesize_incidents("IOC_MATCH", []) == []

    def test_ioc_match_produces_critical_high_confidence_incident(self):
        rows = [
            {"package": "evil-pkg", "version": "1.0.0", "project_path": "/proj/a",
             "ecosystem": "npm", "campaign_name": "shai-hulud-wave-3"},
        ]
        incidents = _synthesize_incidents("IOC_MATCH", rows)
        assert len(incidents) == 1
        incident = incidents[0]
        assert incident["attack_pattern"] == "ioc_match"
        assert incident["severity"] == "CRITICAL"
        assert incident["confidence"] == 0.95
        assert "evil-pkg" in incident["packages"]

    def test_shai_hulud_worm_pattern_and_burst_packages_extracted(self):
        rows = [
            {
                "published_by": "attacker123",
                "packages_published": 12,
                "package_list": ["pkg-a", "pkg-b", "pkg-c"],
                "our_packages_affected": ["pkg-a"],
            }
        ] * 6  # simulate > 5 rows to trigger the 0.90 confidence branch
        incidents = _synthesize_incidents("SHAI_HULUD", rows)
        assert len(incidents) == 1
        incident = incidents[0]
        assert incident["attack_pattern"] == "worm"
        assert incident["confidence"] == 0.90
        assert incident["severity"] == "CRITICAL"

    def test_unknown_query_name_falls_back_to_ioc_match_pattern(self):
        rows = [{"package": "mystery-pkg"}]
        incidents = _synthesize_incidents("SOME_UNMAPPED_QUERY", rows)
        assert incidents[0]["attack_pattern"] == "ioc_match"

    def test_packages_list_json_string_is_parsed(self):
        import json as _json

        rows = [{"packages_list": _json.dumps(["pkg-x", "pkg-y"])}]
        incidents = _synthesize_incidents("MAINTAINER_REPUTATION", rows)
        assert set(incidents[0]["packages"]) == {"pkg-x", "pkg-y"}

    def test_runtime_confirmation_true_when_runtime_status_observed(self):
        rows = [{"package": "pkg-a", "our_project": "/proj/a",
                  "runtime_status": "prod-host-1"}]
        incidents = _synthesize_incidents("BLAST_RADIUS", rows)
        assert incidents[0]["runtime_confirmation"] is True
        assert incidents[0]["blast_radius"][0]["runtime_confirmed"] is True

    def test_incident_has_required_alert_object_fields(self):
        rows = [{"package": "pkg-a"}]
        incidents = _synthesize_incidents("TYPOSQUAT_DISTANCE", rows)
        incident = incidents[0]
        for field in (
            "id", "attack_pattern", "confidence", "severity", "packages",
            "blast_radius", "runtime_confirmation", "remediation_options",
            "raw_findings", "detected_at",
        ):
            assert field in incident
