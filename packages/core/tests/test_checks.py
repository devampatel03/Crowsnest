"""The dependency-change check, run against real git repositories."""

from __future__ import annotations

import json
import shutil
import subprocess
from datetime import UTC, datetime, timedelta

import pytest
from osv_fakes import FakeOSV

from packages.core import checks
from packages.core.checks import CheckError, check_changes, main, render
from packages.core.sources.osv import OSVSource

pytestmark = pytest.mark.skipif(shutil.which("git") is None, reason="git is not installed")


def _ago(**delta) -> str:
    return (datetime.now(UTC).replace(tzinfo=None) - timedelta(**delta)).isoformat()


def _git(cwd, *args):
    subprocess.run(  # noqa: S603
        ["git", "-C", str(cwd), "-c", "user.name=t", "-c", "user.email=t@example.invalid", *args],  # noqa: S607
        check=True, capture_output=True,
    )


def _lock(*packages):
    return json.dumps({"lockfileVersion": 3, "packages": {
        "": {}, **{f"node_modules/{n}": {"version": v} for n, v in packages},
    }})


class FakeIngestor:
    def __init__(self, tables):
        self.tables = tables

    async def ingest_registry_metadata(self, refs, engine, focus=None):
        for table, rows in self.tables.items():
            await engine.ingest(table, rows)
        return 1


def _old_clean_registry(*names):
    return FakeIngestor({
        "npm_packages": [{"name": n, "latest_version": "1.0.0", "weekly_downloads": 5_000_000,
                          "repo_url": "https://github.com/a/b", "created_at": _ago(days=2000)} for n in names],
        "npm_versions": [{"name": n, "version": v, "published_at": _ago(days=400)}
                         for n in names for v in ("1.0.0", "1.3.0", "1.14.0", "1.14.1", "2.0.0")],
    })


@pytest.fixture
def repo(tmp_path):
    root = tmp_path / "repo"
    root.mkdir()
    _git(root, "init", "-q", "-b", "main")
    (root / "package-lock.json").write_text(_lock(("left-pad", "1.3.0"), ("axios", "1.14.0")), encoding="utf-8")
    _git(root, "add", "-A")
    _git(root, "commit", "-q", "-m", "base")
    return root


async def _check(root, base="HEAD", *, osv=None, ingestor=None, **kwargs):
    return await check_changes(
        str(root), base_ref=base, live=True, osv=osv or OSVSource(transport=FakeOSV({}).transport()),
        ingestor=ingestor or _old_clean_registry("axios", "left-pad", "brand-new"), **kwargs,
    )


async def test_only_added_and_changed_versions_are_checked(repo):
    (repo / "package-lock.json").write_text(
        _lock(("left-pad", "1.3.0"), ("axios", "1.14.1"), ("brand-new", "2.0.0")), encoding="utf-8")
    report = await _check(repo)
    assert [(r["package"], r["version"], r["change"]) for r in report["results"]] == [
        ("axios", "1.14.1", "updated"), ("brand-new", "2.0.0", "added"),
    ]
    assert report["results"][0]["previous_versions"] == ["1.14.0"]
    assert report["checked"] == 2 and report["unchanged"] == 1  # left-pad was not rechecked


async def test_a_malicious_version_in_a_pull_request_is_blocked(repo):
    (repo / "package-lock.json").write_text(_lock(("left-pad", "1.3.0"), ("axios", "1.14.1")), encoding="utf-8")
    osv = OSVSource(transport=FakeOSV({("npm", "axios", "1.14.1"): ["MAL-2026-2307"]}).transport())
    report = await _check(repo, osv=osv)
    [blocked] = report["blocked"]
    assert (blocked["package"], blocked["version"]) == ("axios", "1.14.1")
    assert "MAL-2026-2307" in blocked["signals"][0]
    text = render(report)
    assert "[BLOCKED] axios@1.14.1 (was 1.14.0)" in text and "1 version(s) should not be merged." in text


async def test_a_change_that_adds_nothing_new_checks_nothing(repo):
    report = await _check(repo)
    assert report["checked"] == 0 and report["blocked"] == [] and report["results"] == []


async def test_without_a_base_every_version_is_checked(repo):
    report = await _check(repo, base=None)
    assert sorted(r["package"] for r in report["results"]) == ["axios", "left-pad"]
    assert {r["change"] for r in report["results"]} == {"added"}


async def test_a_downgrade_to_a_different_version_counts_as_a_change(repo):
    (repo / "package-lock.json").write_text(_lock(("left-pad", "1.3.0"), ("axios", "1.13.0")), encoding="utf-8")
    report = await _check(repo)
    assert [(r["package"], r["version"]) for r in report["results"]] == [("axios", "1.13.0")]


async def test_a_package_that_was_missing_at_the_base_is_all_new(repo):
    (repo / "requirements.txt").write_text("requests==2.32.3\n", encoding="utf-8")
    report = await _check(repo, ingestor=FakeIngestor({}))
    assert [(r["ecosystem"], r["package"], r["change"]) for r in report["results"]] == [("pypi", "requests", "added")]


async def test_a_project_inside_a_monorepo_is_compared_with_its_own_folder_at_the_base(tmp_path):
    root = tmp_path / "mono"
    app = root / "services" / "web"
    app.mkdir(parents=True)
    _git(root, "init", "-q", "-b", "main")
    (app / "package-lock.json").write_text(_lock(("left-pad", "1.3.0")), encoding="utf-8")
    (root / "package-lock.json").write_text(_lock(("axios", "1.14.0")), encoding="utf-8")
    _git(root, "add", "-A")
    _git(root, "commit", "-q", "-m", "base")
    (app / "package-lock.json").write_text(_lock(("left-pad", "1.3.0"), ("axios", "1.14.1")), encoding="utf-8")
    report = await _check(app)
    assert [(r["package"], r["version"], r["change"]) for r in report["results"]] == [("axios", "1.14.1", "added")]


async def test_an_unusable_ref_or_folder_is_refused(repo, tmp_path):
    for bad in ("--upload-pack=evil", "-x", "a b", "main;rm", ""):
        if bad:
            with pytest.raises(CheckError, match="not a usable git ref"):
                await _check(repo, base=bad)
    with pytest.raises(CheckError, match="git ls-tree failed"):
        await _check(repo, base="no-such-branch")
    with pytest.raises(CheckError, match="not a folder"):
        await _check(tmp_path / "missing")
    plain = tmp_path / "plain"
    plain.mkdir()
    with pytest.raises(CheckError, match="git ls-tree failed"):
        await _check(plain)


async def test_degraded_lookups_are_listed_once(repo):
    (repo / "package-lock.json").write_text(_lock(("left-pad", "1.3.0"), ("axios", "1.14.1")), encoding="utf-8")

    class Down:
        async def find_malicious(self, packages):
            import httpx
            raise httpx.ConnectError("offline")

    report = await check_changes(str(repo), base_ref="HEAD", live=True, osv=Down(),
                                 ingestor=_old_clean_registry("axios"))
    assert report["degraded"] and len(report["degraded"]) == 1
    assert report["blocked"] == []


def test_the_command_line_exit_codes(repo, monkeypatch, capsys):
    (repo / "package-lock.json").write_text(_lock(("left-pad", "1.3.0"), ("axios", "1.14.1")), encoding="utf-8")
    assert main([str(repo), "--base", "HEAD", "--offline", "--min-release-age", "0"]) == 0
    assert "Crowsnest checked 1 package version(s) changed since HEAD" in capsys.readouterr().out
    assert main([str(repo), "--base", "no-such-ref", "--offline"]) == 2
    assert "could not run the check" in capsys.readouterr().err

    blocked = {"base_ref": "HEAD", "project_path": ".", "checked": 1, "unchanged": 0, "degraded": ["x"],
               "results": [], "blocked": [{"package": "axios", "version": "1.14.1", "signals": ["listed as malicious"]}]}

    async def fake(*a, **k):
        return blocked

    monkeypatch.setattr(checks, "check_changes", fake)
    monkeypatch.setenv("GITHUB_ACTIONS", "true")
    assert main([str(repo), "--format", "json"]) == 1
    out = capsys.readouterr().out
    assert '"checked": 1' in out and "::error title=Crowsnest blocked axios@1.14.1::listed as malicious" in out
    blocked["blocked"] = []
    assert main([str(repo), "--fail-on-degraded"]) == 2
    assert main([str(repo)]) == 0
