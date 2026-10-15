"""Contract tests for the FastAPI routes (status, schema, error shape). No network, temp DB."""

from __future__ import annotations

from datetime import UTC
from unittest.mock import AsyncMock, patch

import pytest

from packages.core import api


def _incident(id_="inc-1", severity="HIGH", pkgs=("evil-pkg",)):
    return {
        "id": id_, "attack_pattern": "ioc_match", "confidence": 0.9, "severity": severity,
        "packages": list(pkgs), "blast_radius": [], "runtime_confirmation": False,
        "remediation_options": [], "raw_findings": [], "detected_at": "2026-01-01T00:00:00+00:00",
    }


class TestHealthAndStats:
    def test_health(self, api_client):
        r = api_client.get("/health")
        assert r.status_code == 200
        assert r.json() == {"status": "ok", "version": "0.1.0"}

    def test_stats_shape_on_empty_state(self, api_client):
        r = api_client.get("/api/stats")
        assert r.status_code == 200
        body = r.json()
        for key in ("table_counts", "total_incidents", "active_scans", "snapshots",
                    "total_packages", "total_maintainers", "active_incidents",
                    "last_scan_at", "last_scan_project"):
            assert key in body
        assert body["total_incidents"] == 0
        assert body["last_scan_at"] is None
        assert set(body["active_incidents"]) == {"CRITICAL", "HIGH", "MEDIUM", "LOW"}

    def test_stats_counts_incidents_by_severity(self, api_client):
        api._incident_store.extend([_incident("a", "CRITICAL"), _incident("b", "LOW")])
        body = api_client.get("/api/stats").json()
        assert body["total_incidents"] == 2
        assert body["active_incidents"]["CRITICAL"] == 1
        assert body["active_incidents"]["LOW"] == 1

    def test_lifespan_seeds_iocs(self, api_client):
        rows = api_client.post("/api/query", json={"sql": "SELECT COUNT(*) AS n FROM shai_hulud_iocs"}).json()
        assert rows[0]["n"] > 0


class TestIncidents:
    def test_list_empty(self, api_client):
        assert api_client.get("/api/incidents").json() == []

    def test_list_filter_and_limit(self, api_client):
        api._incident_store.extend([_incident("a", "HIGH"), _incident("b", "LOW"), _incident("c", "HIGH")])
        assert len(api_client.get("/api/incidents?severity=high").json()) == 2
        assert len(api_client.get("/api/incidents?limit=1").json()) == 1

    def test_limit_over_500_is_422(self, api_client):
        assert api_client.get("/api/incidents?limit=501").status_code == 422

    def test_get_by_id_and_404(self, api_client):
        api._incident_store.append(_incident("x1"))
        assert api_client.get("/api/incidents/x1").json()["id"] == "x1"
        r = api_client.get("/api/incidents/nope")
        assert r.status_code == 404
        assert r.json() == {"detail": "Incident not found"}


class TestQueryRoute:
    def test_select_ok(self, api_client):
        r = api_client.post("/api/query", json={"sql": "SELECT 1 AS n"})
        assert r.status_code == 200 and r.json() == [{"n": 1}]

    @pytest.mark.parametrize("sql", [
        "DROP TABLE crowsnest_incidents",
        "SELECT 1; DROP TABLE crowsnest_incidents",
        "DELETE FROM crowsnest_incidents",
        "INSERT INTO crowsnest_incidents VALUES ('a','b')",
    ])
    def test_writes_rejected_with_400(self, api_client, sql):
        r = api_client.post("/api/query", json={"sql": sql})
        assert r.status_code == 400
        assert "detail" in r.json()

    def test_params_substituted(self, api_client):
        r = api_client.post("/api/query", json={"sql": "SELECT :v AS v", "params": {"v": "o'brien"}})
        assert r.json() == [{"v": "o'brien"}]

    def test_missing_sql_is_422(self, api_client):
        assert api_client.post("/api/query", json={}).status_code == 422

    def test_malformed_json_is_422(self, api_client):
        r = api_client.post("/api/query", content="{not json", headers={"content-type": "application/json"})
        assert r.status_code == 422

    def test_unsupported_param_type_is_client_error(self, api_client):
        r = api_client.post("/api/query", json={"sql": "SELECT :v", "params": {"v": [1, 2]}})
        assert r.status_code == 400


class TestVeto:
    def test_unknown_package_is_not_blocked_but_has_signal(self, api_client):
        r = api_client.post("/api/veto", json={"package": "totally-unknown-pkg-zzz"})
        body = r.json()
        assert r.status_code == 200
        assert body["blocked"] is False
        assert body["probability"] == 0.2
        assert body["override_flag"] is None
        assert "not found" in body["reason"].lower()

    def test_active_ioc_blocks_with_probability_one(self, api_client):
        ioc = api_client.post("/api/query", json={
            "sql": "SELECT value FROM shai_hulud_iocs WHERE ioc_type = 'package_name' LIMIT 1"}).json()
        if not ioc:
            pytest.skip("no package_name IOC in seed data (data-dependent)")
        r = api_client.post("/api/veto", json={"package": ioc[0]["value"]}).json()
        assert r["blocked"] is True and r["probability"] == 1.0
        assert r["override_flag"] == "--crowsnest-acknowledge-risk"
        assert any("ACTIVE IOC" in s for s in r["signals"])

    def test_known_hallucination_pattern_adds_signal(self, api_client):
        rows = api_client.post("/api/query", json={
            "sql": "SELECT package FROM known_hallucination_patterns LIMIT 1"}).json()
        if not rows:
            pytest.skip("no hallucination seed rows (data-dependent)")
        r = api_client.post("/api/veto", json={"package": rows[0]["package"]}).json()
        assert any("hallucination" in s for s in r["signals"])

    def test_missing_package_is_422(self, api_client):
        assert api_client.post("/api/veto", json={}).status_code == 422

    def _add_npm(self, api_client, name, downloads, created_days_ago, repo="https://github.com/a/b"):
        from datetime import datetime, timedelta
        rec = {"name": name, "weekly_downloads": downloads, "repo_url": repo,
               "created_at": datetime.now(UTC).replace(tzinfo=None) - timedelta(days=created_days_ago)}
        api_client.portal.call(api._engine.ingest, "npm_packages", [rec])

    def test_new_unpopular_package_without_repo_is_blocked(self, api_client):
        self._add_npm(api_client, "brand-new-pkg", 10, 5, repo="")
        r = api_client.post("/api/veto", json={"package": "brand-new-pkg"}).json()
        assert r["probability"] == 0.9 and r["blocked"] is True
        assert len(r["signals"]) == 3

    def test_old_popular_package_is_clean(self, api_client):
        self._add_npm(api_client, "boring-popular", 5_000_000, 3000)
        r = api_client.post("/api/veto", json={"package": "boring-popular"}).json()
        assert r["probability"] == 0.0 and r["blocked"] is False
        assert r["reason"] == "No specific signals detected"

    def test_threshold_boundary_new_but_popular_with_repo_not_blocked(self, api_client):
        self._add_npm(api_client, "new-but-ok", 5_000_000, 3)
        r = api_client.post("/api/veto", json={"package": "new-but-ok"}).json()
        assert r["probability"] == 0.4 and r["blocked"] is False

    def test_typosquat_of_popular_package_is_signalled(self, api_client):
        self._add_npm(api_client, "reactt-dom-x", 5_000_000, 3000)
        self._add_npm(api_client, "reactt-dom", 5_000_000, 3000)
        r = api_client.post("/api/veto", json={"package": "reactt-dum"}).json()
        assert any("Typosquat risk" in s for s in r["signals"])

    def test_sql_injection_in_package_name_is_inert(self, api_client):
        r = api_client.post("/api/veto", json={"package": "x'; DROP TABLE crowsnest_incidents; --"})
        assert r.status_code == 200
        assert api_client.get("/api/stats").json()["table_counts"].get("crowsnest_incidents") is not None


class TestLevenshteinApprox:
    @pytest.mark.parametrize("a,b,expected", [
        ("abc", "abc", 0), ("lodash", "lodahs", 2), ("lodash", "lodashh", 1), ("a", "abcdef", 99),
    ])
    def test_values(self, a, b, expected):
        assert api._levenshtein_approx(a, b) == expected


class TestLockfilesAndOthers:
    def test_lockfiles_empty_and_filtered(self, api_client):
        assert api_client.get("/api/lockfiles").json() == []
        assert api_client.get("/api/lockfiles?ecosystem=npm").json() == []

    def test_lockfiles_ecosystem_injection_is_inert(self, api_client):
        r = api_client.get("/api/lockfiles", params={"ecosystem": "npm' OR '1'='1"})
        assert r.status_code == 200 and r.json() == []

    def test_reputation_returns_list_and_caches(self, api_client):
        first = api_client.get("/api/maintainers/reputation")
        assert first.status_code == 200 and isinstance(first.json(), list)
        assert api_client.get("/api/maintainers/reputation?limit=1").status_code == 200

    def test_reputation_limit_over_500_is_422(self, api_client):
        assert api_client.get("/api/maintainers/reputation?limit=501").status_code == 422

    def test_blast_radius_shape(self, api_client):
        r = api_client.post("/api/blast-radius", json={"maintainer": "nobody"})
        assert r.status_code == 200
        body = r.json()
        assert body["maintainer"] == "nobody"
        assert body["total_affected_deps"] == 0
        assert body["blast_radius_entries"] == []

    def test_investigate_shape(self, api_client):
        r = api_client.post("/api/investigate", json={"package": "left-pad"})
        assert r.status_code == 200
        body = r.json()
        assert body["package"] == "left-pad" and body["socket_alerts"] == []

    def test_replay_unknown_campaign(self, api_client):
        r = api_client.post("/api/replay", json={"ioc_name": "no-such-campaign"})
        assert r.status_code == 200
        body = r.json()
        assert body["summary"] == {"total_iocs": 0, "affected_packages": 0, "your_exposed_packages": 0}
        assert body["snapshot_used"] is None

    def test_replay_known_campaign_finds_iocs(self, api_client):
        name = api_client.post("/api/query", json={
            "sql": "SELECT campaign_name FROM shai_hulud_iocs LIMIT 1"}).json()
        if not name:
            pytest.skip("no seed IOCs (data-dependent)")
        r = api_client.post("/api/replay", json={"ioc_name": name[0]["campaign_name"]}).json()
        assert r["summary"]["total_iocs"] > 0


class TestScan:
    def test_status_404(self, api_client):
        r = api_client.get("/api/scan/does-not-exist/status")
        assert r.status_code == 404 and r.json() == {"detail": "Scan not found"}

    def test_scan_missing_project_path_is_422(self, api_client):
        assert api_client.post("/api/scan", json={}).status_code == 422

    def test_scan_rejects_a_folder_that_does_not_exist(self, api_client, tmp_path):
        r = api_client.post("/api/scan", json={"project_path": str(tmp_path / "nope")})
        assert r.status_code == 400 and "does not exist" in r.json()["detail"]

    def test_scan_rejects_a_file_path(self, api_client, tmp_path):
        f = tmp_path / "package-lock.json"
        f.write_text("{}")
        r = api_client.post("/api/scan", json={"project_path": str(f)})
        assert r.status_code == 400 and "not a directory" in r.json()["detail"]

    def test_scan_rejects_a_folder_without_a_lockfile(self, api_client, tmp_path):
        r = api_client.post("/api/scan", json={"project_path": str(tmp_path)})
        assert r.status_code == 400 and "No supported lockfile" in r.json()["detail"]

    def test_scan_rejects_a_missing_explicit_lockfile(self, api_client, tmp_path):
        r = api_client.post(
            "/api/scan", json={"project_path": str(tmp_path), "lockfile_path": str(tmp_path / "x.lock")}
        )
        assert r.status_code == 400 and "lockfile does not exist" in r.json()["detail"]

    def test_scan_rejection_does_not_register_a_scan(self, api_client, tmp_path):
        from packages.core import api

        before = len(api._scan_store)
        api_client.post("/api/scan", json={"project_path": str(tmp_path / "nope")})
        assert len(api._scan_store) == before

    def _wait(self, client, scan_id):
        # Each request yields to the app's event loop, so the background task progresses.
        for _ in range(2000):
            body = client.get(f"/api/scan/{scan_id}/status").json()
            if body["status"] in ("complete", "failed"):
                return body
        raise AssertionError("scan never finished")

    def test_scan_completes_with_mocked_pipeline(self, api_client):
        fake_result = {"triage_output": [_incident("s1", "CRITICAL")], "token_usage": 7,
                       "remediation_drafts": []}
        with patch.object(api, "run_scan", AsyncMock(return_value=fake_result)), \
             patch("packages.core.sources.ingestion.IngestorService.full_ingest", AsyncMock()):
            sid = api_client.post("/api/scan", json={"project_path": "."}).json()["scan_id"]
            body = self._wait(api_client, sid)
        assert body["status"] == "complete"
        assert body["token_usage"] == 7
        assert api_client.get("/api/incidents/s1").status_code == 200
        rows = api_client.post("/api/query", json={"sql": "SELECT id FROM crowsnest_incidents"}).json()
        assert {"id": "s1"} in rows

    def test_scan_failure_is_reported_not_raised(self, api_client):
        with patch.object(api, "run_scan", AsyncMock(side_effect=RuntimeError("boom"))), \
             patch("packages.core.sources.ingestion.IngestorService.full_ingest", AsyncMock()):
            sid = api_client.post("/api/scan", json={"project_path": "."}).json()["scan_id"]
            body = self._wait(api_client, sid)
        assert body["status"] == "failed" and body["error"] == "boom"

    def test_rescan_upserts_instead_of_duplicating(self, api_client):
        res = {"triage_output": [_incident("dup", "HIGH")], "token_usage": 0, "remediation_drafts": []}
        with patch.object(api, "run_scan", AsyncMock(return_value=res)), \
             patch("packages.core.sources.ingestion.IngestorService.full_ingest", AsyncMock()):
            for _ in range(2):
                sid = api_client.post("/api/scan", json={"project_path": "."}).json()["scan_id"]
                self._wait(api_client, sid)
        assert len(api_client.get("/api/incidents").json()) == 1


class TestEventsAndHelpers:
    @pytest.mark.asyncio
    async def test_push_event_enqueues_with_timestamp(self):
        while not api._event_queue.empty():
            api._event_queue.get_nowait()
        await api._push_event("x", {"a": 1})
        ev = api._event_queue.get_nowait()
        assert ev["type"] == "x" and ev["a"] == 1 and "timestamp" in ev

    @pytest.mark.asyncio
    async def test_push_event_drops_when_full_without_raising(self):
        while not api._event_queue.empty():
            api._event_queue.get_nowait()
        for i in range(api._event_queue.maxsize):
            api._event_queue.put_nowait({"i": i})
        await api._push_event("overflow", {})  # must not raise
        assert api._event_queue.qsize() == api._event_queue.maxsize
        while not api._event_queue.empty():
            api._event_queue.get_nowait()

    @pytest.mark.asyncio
    async def test_events_generator_emits_connected_first(self):
        resp = await api.event_stream()
        gen = resp.body_iterator
        first = await gen.__anext__()
        assert first.startswith("data: ") and '"connected"' in first
        assert resp.media_type == "text/event-stream"
        assert resp.headers["cache-control"] == "no-cache"
        await gen.aclose()

    @pytest.mark.asyncio
    async def test_get_engine_503_when_uninitialised(self):
        from fastapi import HTTPException
        saved = api._engine
        api._engine = None
        try:
            with pytest.raises(HTTPException) as ei:
                api._get_engine()
            assert ei.value.status_code == 503
        finally:
            api._engine = saved

    def test_cors_rejects_foreign_origins(self, api_client):
        """A page from an arbitrary origin must not get CORS access."""
        r = api_client.get("/health", headers={"Origin": "http://evil.example"})
        assert r.headers.get("access-control-allow-origin") is None
        pre = api_client.options(
            "/api/query",
            headers={"Origin": "http://evil.example", "Access-Control-Request-Method": "POST"},
        )
        assert pre.headers.get("access-control-allow-origin") is None
        assert pre.headers.get("access-control-allow-credentials") is None

    def test_cors_allows_the_dashboard_origin(self, api_client):
        r = api_client.get("/health", headers={"Origin": "http://localhost:3000"})
        assert r.headers.get("access-control-allow-origin") == "http://localhost:3000"
