"""The shared projects folder: mapping what a person types to a path in the container, and listing what can be scanned."""

from __future__ import annotations

import json

import pytest

from packages.core.config import get_settings
from packages.core.projects import list_projects, resolve_scan_path

ROOT = "/projects"
WIN_HOST = r"C:\Users\Me\code"


class TestResolveScanPath:
    def test_outside_docker_nothing_changes(self):
        assert resolve_scan_path(r"C:\Users\Me\app", "", "") == r"C:\Users\Me\app"
        assert resolve_scan_path("/home/me/app", "", "") == "/home/me/app"

    def test_a_path_already_in_the_container_is_kept(self):
        assert resolve_scan_path("/projects/app", ROOT, WIN_HOST) == "/projects/app"
        assert resolve_scan_path("/projects/app/", ROOT, WIN_HOST) == "/projects/app"
        assert resolve_scan_path("/projects", ROOT, WIN_HOST) == "/projects"

    @pytest.mark.parametrize(
        "typed",
        [
            r"C:\Users\Me\code\app",
            "C:/Users/Me/code/app",
            r"c:\users\me\code\app",  # Windows paths ignore case
            r"C:\Users\Me\code\app\\",
            r'"C:\Users\Me\code\app"',  # pasted with quotes ("Copy as path")
            "  C:/Users/Me/code/app  ",
        ],
    )
    def test_a_windows_path_under_the_shared_folder_is_mapped(self, typed):
        assert resolve_scan_path(typed, ROOT, WIN_HOST) == "/projects/app"

    def test_the_shared_folder_itself_maps_to_the_root(self):
        assert resolve_scan_path(r"C:\Users\Me\code", ROOT, WIN_HOST) == "/projects"

    def test_a_posix_host_path_is_case_sensitive(self):
        assert resolve_scan_path("/Users/me/code/app", ROOT, "/Users/me/code") == "/projects/app"
        assert resolve_scan_path("/users/me/code/app", ROOT, "/Users/me/code") == "/users/me/code/app"

    def test_a_sibling_with_the_same_prefix_is_not_inside(self):
        assert resolve_scan_path(r"C:\Users\Me\code-old\app", ROOT, WIN_HOST) == r"C:\Users\Me\code-old\app"

    def test_a_folder_outside_the_shared_one_is_returned_as_typed(self):
        assert resolve_scan_path(r"D:\other\app", ROOT, WIN_HOST) == r"D:\other\app"
        assert resolve_scan_path("/etc", ROOT, WIN_HOST) == "/etc"

    @pytest.mark.parametrize("typed,expected", [("app", "/projects/app"), ("./app", "/projects/app"), ("code/app", "/projects/code/app")])
    def test_a_bare_name_is_looked_up_in_the_shared_folder(self, typed, expected):
        assert resolve_scan_path(typed, ROOT, "") == expected

    @pytest.mark.parametrize("typed", ["..", "../etc", "app/../../etc", "a/../.."])
    def test_a_name_cannot_climb_out_of_the_shared_folder(self, typed):
        assert resolve_scan_path(typed, ROOT, "") == typed

    def test_empty_input_is_untouched(self):
        assert resolve_scan_path("", ROOT, WIN_HOST) == ""
        assert resolve_scan_path("   ", ROOT, WIN_HOST) == "   "

    def test_without_a_known_host_a_windows_path_is_not_guessed(self):
        assert resolve_scan_path(r"C:\Users\Me\code\app", ROOT, "") == r"C:\Users\Me\code\app"


def _project(folder, lockfile="package-lock.json"):
    folder.mkdir(parents=True, exist_ok=True)
    (folder / lockfile).write_text(json.dumps({"lockfileVersion": 3, "packages": {}}), encoding="utf-8")


class TestListProjects:
    def test_not_in_docker_lists_nothing(self):
        assert list_projects("") == []

    def test_a_missing_folder_lists_nothing(self, tmp_path):
        assert list_projects(str(tmp_path / "nope")) == []

    def test_finds_projects_with_a_lockfile_and_skips_the_rest(self, tmp_path):
        _project(tmp_path / "web")
        _project(tmp_path / "api", "requirements.txt")
        (tmp_path / "notes").mkdir()
        names = [p["name"] for p in list_projects(str(tmp_path))]
        assert names == ["api", "web"]

    def test_paths_are_absolute_and_usable(self, tmp_path):
        _project(tmp_path / "web")
        (item,) = list_projects(str(tmp_path))
        assert item["path"] == (tmp_path / "web").as_posix()

    def test_finds_a_project_one_level_down(self, tmp_path):
        _project(tmp_path / "team" / "web")
        assert [p["name"] for p in list_projects(str(tmp_path))] == ["team/web"]

    def test_does_not_go_deeper_than_two_levels(self, tmp_path):
        _project(tmp_path / "a" / "b" / "c")
        assert list_projects(str(tmp_path)) == []

    def test_ignores_dependency_and_hidden_folders(self, tmp_path):
        _project(tmp_path / "web" / "node_modules" / "left-pad")
        _project(tmp_path / ".cache" / "x")
        _project(tmp_path / "web")
        assert [p["name"] for p in list_projects(str(tmp_path))] == ["web"]

    def test_the_shared_folder_itself_can_be_a_project(self, tmp_path):
        (tmp_path / "package-lock.json").write_text("{}", encoding="utf-8")
        assert [p["path"] for p in list_projects(str(tmp_path))] == [tmp_path.as_posix()]

    def test_the_list_is_capped(self, tmp_path):
        for i in range(210):
            _project(tmp_path / f"p{i:03d}")
        assert len(list_projects(str(tmp_path))) == 200


@pytest.fixture
def shared(tmp_path, monkeypatch):
    """Run as the Docker image does: a shared folder, and the folder it came from."""
    _project(tmp_path / "demo")
    monkeypatch.setenv("CROWSNEST_PROJECTS_ROOT", str(tmp_path))
    monkeypatch.setenv("CROWSNEST_PROJECTS_HOST", r"C:\Users\Me\code")
    get_settings.cache_clear()
    yield tmp_path
    get_settings.cache_clear()


class TestRoutes:
    def test_projects_outside_docker(self, api_client):
        assert api_client.get("/api/projects").json() == {"root": None, "host": None, "projects": []}

    def test_projects_in_docker_lists_the_shared_folders(self, api_client, shared):
        body = api_client.get("/api/projects").json()
        assert body["root"] == str(shared)
        assert body["host"] == r"C:\Users\Me\code"
        assert [p["name"] for p in body["projects"]] == ["demo"]

    def test_a_scan_by_bare_name_starts(self, api_client, shared):
        r = api_client.post("/api/scan", json={"project_path": "demo"})
        assert r.status_code == 200, r.text
        assert "scan_id" in r.json()

    def test_a_scan_by_host_path_starts(self, api_client, shared):
        r = api_client.post("/api/scan", json={"project_path": r"C:\Users\Me\code\demo"})
        assert r.status_code == 200, r.text

    def test_a_scan_of_a_folder_it_cannot_see_says_how_to_share_it(self, api_client, shared):
        r = api_client.post("/api/scan", json={"project_path": r"D:\elsewhere\app"})
        assert r.status_code == 400
        detail = r.json()["detail"]
        assert "outside the shared folder" in detail
        assert "CROWSNEST_PROJECTS" in detail
        assert r"C:\Users\Me\code" in detail

    def test_a_folder_without_a_lockfile_is_still_refused(self, api_client, shared):
        (shared / "empty").mkdir()
        r = api_client.post("/api/scan", json={"project_path": "empty"})
        assert r.status_code == 400
        assert "No supported lockfile" in r.json()["detail"]


class TestSharedFolderIsTheOnlyWayIn:
    def test_a_path_outside_the_shared_folder_is_refused_even_if_it_exists(self, api_client, shared, tmp_path_factory):
        outside = tmp_path_factory.mktemp("outside")
        (outside / "package-lock.json").write_text("{}", encoding="utf-8")
        r = api_client.post("/api/scan", json={"project_path": str(outside)})
        assert r.status_code == 400
        assert "outside the shared folder" in r.json()["detail"]

    @pytest.mark.parametrize("typed", ["..", "../etc", "demo/../.."])
    def test_dot_dot_cannot_climb_out(self, api_client, shared, typed):
        r = api_client.post("/api/scan", json={"project_path": typed})
        assert r.status_code == 400

    def test_a_symlink_out_of_the_shared_folder_is_refused(self, api_client, shared, tmp_path_factory):
        outside = tmp_path_factory.mktemp("target")
        (outside / "package-lock.json").write_text("{}", encoding="utf-8")
        link = shared / "sneaky"
        try:
            link.symlink_to(outside, target_is_directory=True)
        except (OSError, NotImplementedError):
            pytest.skip("this system does not allow creating symlinks")
        r = api_client.post("/api/scan", json={"project_path": "sneaky"})
        assert r.status_code == 400
        assert "outside the shared folder" in r.json()["detail"]

    def test_outside_docker_any_folder_is_still_allowed(self, api_client, tmp_path):
        (tmp_path / "package-lock.json").write_text("{}", encoding="utf-8")
        assert api_client.post("/api/scan", json={"project_path": str(tmp_path)}).status_code == 200


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


class TestHealthTellsTheCommandLineWhatIsShared:
    def test_health_reports_the_host_folder(self, api_client, shared):
        body = api_client.get("/health").json()
        assert body["projects_root"] == str(shared)
        assert body["projects_host"] == r"C:\Users\Me\code"


class TestCheckChangesUsesTheSameFolders:
    def test_a_bare_name_is_found_in_the_shared_folder(self, api_client, shared):
        r = api_client.post("/api/check-changes", json={"project_path": "demo"})
        assert r.status_code == 200, r.text
        assert r.json()["checked"] >= 0

    def test_a_folder_outside_the_shared_one_is_refused(self, api_client, shared):
        r = api_client.post("/api/check-changes", json={"project_path": "/etc"})
        assert r.status_code == 400
        assert "outside the shared folder" in r.json()["detail"]

    def test_dot_dot_cannot_climb_out(self, api_client, shared):
        assert api_client.post("/api/check-changes", json={"project_path": "../.."}).status_code == 400
