"""A scan reports what it found, every time it is run."""

from __future__ import annotations


class TestRescanStillReportsWhatItFound:
    """A second scan of the same project found the same problems, so it must say so (it used to report none)."""

    def _scan(self, client, res):
        from unittest.mock import AsyncMock, patch

        from packages.core import api

        with patch.object(api, "run_scan", AsyncMock(return_value=res)), \
             patch("packages.core.sources.ingestion.IngestorService.full_ingest", AsyncMock()):
            sid = client.post("/api/scan", json={"project_path": "."}).json()["scan_id"]
            for _ in range(2000):
                body = client.get(f"/api/scan/{sid}/status").json()
                if body["status"] in ("complete", "failed"):
                    return body
        raise AssertionError("scan never finished")

    def test_the_second_scan_lists_the_same_incident(self, api_client):
        inc = {
            "id": "again", "attack_pattern": "slopsquat", "confidence": 0.9, "severity": "HIGH", "packages": ["react-codeshift"],
            "blast_radius": [], "runtime_confirmation": False, "remediation_options": [], "raw_findings": [],
            "detected_at": "2026-01-01T00:00:00+00:00",
        }
        res = {"triage_output": [inc], "token_usage": 0, "remediation_drafts": []}
        first = self._scan(api_client, res)
        second = self._scan(api_client, res)
        assert [i["id"] for i in first["incidents"]] == ["again"]
        assert [i["id"] for i in second["incidents"]] == ["again"]
        assert first["new_incident_count"] == 1
        assert second["new_incident_count"] == 0
        assert len(api_client.get("/api/incidents").json()) == 1

    def test_the_finished_event_counts_everything_found(self, api_client):
        from packages.core import api

        inc = {
            "id": "ev1", "attack_pattern": "ioc_match", "confidence": 0.9, "severity": "CRITICAL", "packages": ["x"],
            "blast_radius": [], "runtime_confirmation": False, "remediation_options": [], "raw_findings": [],
            "detected_at": "2026-01-01T00:00:00+00:00",
        }
        res = {"triage_output": [inc], "token_usage": 0, "remediation_drafts": []}
        self._scan(api_client, res)
        while not api._event_queue.empty():
            api._event_queue.get_nowait()
        self._scan(api_client, res)
        done = []
        while not api._event_queue.empty():
            ev = api._event_queue.get_nowait()
            if ev.get("type") == "scan_progress" and ev.get("phase") == "complete":
                done.append(ev)
        assert done and done[-1]["incidents_found"] == 1
