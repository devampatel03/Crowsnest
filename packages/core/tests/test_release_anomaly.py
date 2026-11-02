"""Release-anomaly detection: provenance parsing, adapter details, and the RELEASE_ANOMALY query on real incidents."""

from __future__ import annotations

import base64
import json
from datetime import UTC, datetime, timedelta

import duckdb
import httpx

from packages.core.agents.investigation import investigation_node
from packages.core.coral.engine import CoralEngine
from packages.core.queries.templates import RELEASE_CHECK_SQL, QueryLibrary
from packages.core.sources.npm import NpmRegistrySource
from packages.core.sources.provenance import (
    npm_provenance_repo,
    pypi_provenance_repo,
    recent_with_predecessor,
)
from packages.core.sources.pypi import PyPISource


def _ago(**delta) -> str:
    return (datetime.now(UTC).replace(tzinfo=None) - timedelta(**delta)).isoformat()


def _statement(repo: str) -> str:
    payload = {"predicate": {"buildDefinition": {"externalParameters": {"workflow": {"repository": repo}}}}}
    return base64.b64encode(json.dumps(payload).encode()).decode()


def _npm_attestations(repo: str) -> dict:
    return {"attestations": [
        {"predicateType": "https://github.com/npm/attestation/tree/main/specs/publish/v0.1",
         "bundle": {"dsseEnvelope": {"payload": base64.b64encode(b"{}").decode()}}},
        {"predicateType": "https://slsa.dev/provenance/v1",
         "bundle": {"dsseEnvelope": {"payload": _statement(repo)}}},
    ]}


# ---- provenance parsing ----------------------------------------------------------------------------------------

def test_npm_provenance_repo_reads_the_slsa_statement():
    assert npm_provenance_repo(_npm_attestations("https://github.com/sigstore/sigstore-js")) == \
        "https://github.com/sigstore/sigstore-js"


def test_npm_provenance_repo_tolerates_missing_or_malformed_data():
    assert npm_provenance_repo(None) is None
    assert npm_provenance_repo({}) is None
    assert npm_provenance_repo({"attestations": [{"predicateType": "https://slsa.dev/provenance/v1", "bundle": {}}]}) is None
    broken = {"attestations": [{"predicateType": "https://slsa.dev/provenance/v1",
                                "bundle": {"dsseEnvelope": {"payload": "not-base64!!"}}}]}
    assert npm_provenance_repo(broken) is None


def test_pypi_provenance_repo_builds_a_url_from_the_publisher():
    doc = {"attestation_bundles": [{"publisher": {"kind": "GitHub", "repository": "BerriAI/litellm"}}]}
    assert pypi_provenance_repo(doc) == "https://github.com/BerriAI/litellm"
    assert pypi_provenance_repo({"attestation_bundles": [{"publisher": {"kind": "GitLab", "repository": "a/b"}}]}) \
        == "https://gitlab.com/a/b"
    assert pypi_provenance_repo({"attestation_bundles": [{"publisher": {"kind": "Other", "repository": "a/b"}}]}) is None
    assert pypi_provenance_repo(None) is None


def test_recent_with_predecessor_picks_new_releases_and_the_one_before():
    now = datetime(2026, 10, 24)
    published = {
        "1.0.0": datetime(2025, 1, 1), "1.1.0": datetime(2026, 1, 1), "1.2.0": datetime(2026, 10, 20),
        "1.3.0": datetime(2026, 10, 23, tzinfo=UTC), "0.9.0": None,
    }
    assert recent_with_predecessor(published, days=30, now=now) == {"1.1.0", "1.2.0", "1.3.0"}
    assert recent_with_predecessor({"1.0.0": datetime(2020, 1, 1)}, days=30, now=now) == set()


def test_a_backport_is_compared_with_the_previous_version_of_its_own_line():
    now = datetime(2026, 10, 24)
    published = {
        "2.0.53": datetime(2026, 8, 1), "2.0.54": datetime(2026, 9, 15), "2.1.0": datetime(2026, 9, 24),
        "2.1.4": datetime(2026, 10, 7), "2.0.55": datetime(2026, 10, 16),   # backport after 2.1.4
        "2.2.0rc1": datetime(2026, 10, 20),                                 # a pre-release has its own line
        "3.0.0": datetime(2025, 1, 1),
    }
    chosen = recent_with_predecessor(published, days=30, now=now)
    assert {"2.0.55", "2.0.54"} <= chosen          # the backport brings in 2.0.54, not 2.1.4
    assert "2.0.53" not in chosen and "3.0.0" not in chosen
    assert "2.2.0rc1" in chosen and "2.1.4" in chosen


# ---- adapters ---------------------------------------------------------------------------------------------------

async def test_npm_adapter_reads_size_provenance_and_the_build_repository_for_recent_releases():
    recent, old = _ago(days=2), _ago(days=400)
    doc = {
        "name": "axios", "dist-tags": {"latest": "1.14.1"}, "time": {"created": old, "modified": recent, "1.12.0": _ago(days=500),
                                                                        "1.13.0": old, "1.14.0": _ago(days=20), "1.14.1": recent},
        "versions": {
            "1.12.0": {"dist": {"unpackedSize": 90, "attestations": {"url": "https://registry.npmjs.org/-/att/oldest"}},
                       "_npmUser": {"name": "jason"}},
            "1.13.0": {"dist": {"unpackedSize": 100, "attestations": {"url": "https://registry.npmjs.org/-/att/old"}},
                       "_npmUser": {"name": "jason"}},
            "1.14.0": {"dist": {"unpackedSize": 110, "attestations": {"url": "https://registry.npmjs.org/-/att/mid"}},
                       "_npmUser": {"name": "jason"}, "scripts": {"postinstall": "node x.js"}},
            "1.14.1": {"dist": {"unpackedSize": 120}, "_npmUser": {"name": "jason"},
                       "dependencies": {"plain-crypto-js": "^4"}},
        },
    }
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.path)
        if request.url.path == "/axios":
            return httpx.Response(200, json=doc)
        if request.url.path == "/-/att/mid":
            return httpx.Response(200, json=_npm_attestations("https://github.com/axios/axios"))
        if request.url.path.startswith("/downloads"):
            return httpx.Response(200, json={"downloads": 9})
        return httpx.Response(404)

    records = await NpmRegistrySource(transport=httpx.MockTransport(handler)).fetch(package="axios")
    versions = {r["version"]: r for r in records if r["_table"] == "npm_versions"}
    assert versions["1.14.1"]["has_provenance"] is False and versions["1.14.0"]["has_provenance"] is True
    assert versions["1.14.0"]["unpacked_size"] == 110
    assert versions["1.14.0"]["has_install_script"] is True  # postinstall counts as an install-time script
    assert versions["1.14.0"]["provenance_repo"] == "https://github.com/axios/axios"
    # 1.12.0 is neither recent nor the predecessor of a recent release, so its bundle is never requested.
    assert versions["1.12.0"]["provenance_repo"] is None and "/-/att/oldest" not in seen


async def test_pypi_adapter_reads_dependencies_size_and_provenance_for_recent_releases():
    recent, old = _ago(days=1), _ago(days=300)

    def release(version, requires):
        return {"info": {"requires_dist": requires},
                "urls": [{"filename": f"litellm-{version}-py3-none-any.whl", "size": 5000},
                         {"filename": f"litellm-{version}.tar.gz", "size": 9000}]}

    routes = {
        "/pypi/litellm/json": {
            "info": {"version": "1.107.0", "project_urls": {"Source": "https://github.com/BerriAI/litellm"}},
            "releases": {"0.9.0": [{"upload_time_iso_8601": _ago(days=400) + "Z"}],
                         "1.0.0": [{"upload_time_iso_8601": old + "Z"}],
                         "1.106.2": [{"upload_time_iso_8601": _ago(days=10) + "Z"}],
                         "1.107.0": [{"upload_time_iso_8601": recent + "Z"}]},
        },
        "/pypi/litellm/1.106.2/json": release("1.106.2", ["httpx>=0.2", "Pydantic; extra == 'proxy'", "click"]),
        "/pypi/litellm/1.107.0/json": release("1.107.0", ["httpx>=0.2"]),
        "/integrity/litellm/1.106.2/litellm-1.106.2-py3-none-any.whl/provenance":
            {"attestation_bundles": [{"publisher": {"kind": "GitHub", "repository": "BerriAI/litellm"}}]},
        "/integrity/litellm/1.107.0/litellm-1.107.0-py3-none-any.whl/provenance":
            {"attestation_bundles": [{"publisher": {"kind": "GitHub", "repository": "Berri-AI/litellm"}}]},
    }
    fetched: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        fetched.append(request.url.path)
        body = routes.get(request.url.path)
        return httpx.Response(200, json=body) if body else httpx.Response(404)

    records = await PyPISource(transport=httpx.MockTransport(handler)).fetch(package="litellm")
    versions = {r["version"]: r for r in records if r["_table"] == "pypi_versions"}
    assert json.loads(versions["1.106.2"]["dependencies"]) == ["click", "httpx"]  # the extra is not a default install
    assert versions["1.107.0"]["provenance_repo"] == "https://github.com/Berri-AI/litellm"
    assert versions["1.107.0"]["unpacked_size"] == 5000
    assert versions["0.9.0"]["dependencies"] is None and "/pypi/litellm/0.9.0/json" not in fetched


async def test_pypi_release_without_provenance_is_recorded_as_none_not_unknown():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/pypi/pkg/json":
            return httpx.Response(200, json={"info": {"version": "1"}, "releases": {
                "1": [{"upload_time_iso_8601": _ago(days=1) + "Z"}]}})
        if request.url.path == "/pypi/pkg/1/json":
            return httpx.Response(200, json={"info": {}, "urls": [{"filename": "pkg-1.whl", "size": 1}]})
        return httpx.Response(404)

    records = await PyPISource(transport=httpx.MockTransport(handler)).fetch(package="pkg")
    version = next(r for r in records if r["_table"] == "pypi_versions")
    assert version["has_provenance"] is False


# ---- the query, on the 2026 incidents --------------------------------------------------------------------------

def _npm_version(name, version, published, by, *, deps=None, provenance=None, repo=None, size=None, hook=False):
    return {"name": name, "version": version, "published_at": published, "published_by": by,
            "dependencies": json.dumps(deps or {}), "has_install_script": hook,
            "has_provenance": provenance, "provenance_repo": repo, "unpacked_size": size}


def _lock(package, version, eco="npm", project="/app"):
    return {"project_path": project, "ecosystem": eco, "package": package, "version": version,
            "integrity_hash": "", "resolved_url": "", "declared_in": "direct", "parent_chain": []}


async def _hits(engine):
    return {(r["package"], r["version"]): r for r in await engine.query(QueryLibrary.get("RELEASE_ANOMALY"))}


async def test_axios_hijack_is_flagged_by_a_dropped_provenance_and_a_new_dependency(engine):
    await engine.ingest("npm_versions", [
        _npm_version("axios", "1.14.0", _ago(days=30), "jason", deps={"follow-redirects": "1"}, provenance=True,
                     repo="https://github.com/axios/axios"),
        _npm_version("axios", "1.14.1", _ago(hours=3), "jason", deps={"follow-redirects": "1", "plain-crypto-js": "4"},
                     provenance=False),
    ])
    await engine.ingest("local_lockfiles", [_lock("axios", "1.14.1")])
    hit = (await _hits(engine))[("axios", "1.14.1")]
    assert hit["score"] == 3
    assert sorted(hit["signals"]) == ["dependency_added", "provenance_dropped"]


async def test_node_ipc_hijack_is_flagged_by_a_new_publisher_after_a_long_silence_and_a_size_jump(engine):
    await engine.ingest("npm_versions", [
        _npm_version("node-ipc", "12.0.0", _ago(days=640), "riaevangelist", provenance=False, size=37_000),
        _npm_version("node-ipc", "12.0.1", _ago(hours=2), "atiertant", provenance=False, size=117_000),
    ])
    await engine.ingest("local_lockfiles", [_lock("node-ipc", "12.0.1")])
    hit = (await _hits(engine))[("node-ipc", "12.0.1")]
    assert sorted(hit["signals"]) == ["dormant_release", "new_publisher", "size_jump"]
    assert hit["score"] == 4


async def test_litellm_fork_build_is_flagged_by_a_changed_build_repository(engine):
    await engine.ingest("pypi_packages", [{"name": "litellm", "latest_version": "1.107.0",
                                           "repo_url": "https://github.com/BerriAI/litellm"}])
    await engine.ingest("pypi_versions", [
        {"name": "litellm", "version": "1.106.2", "published_at": _ago(days=9), "dependencies": '["httpx"]',
         "has_provenance": True, "provenance_repo": "https://github.com/BerriAI/litellm", "unpacked_size": 5000},
        {"name": "litellm", "version": "1.107.0", "published_at": _ago(hours=1), "dependencies": '["httpx"]',
         "has_provenance": True, "provenance_repo": "https://github.com/Berri-AI/litellm", "unpacked_size": 5100},
    ])
    await engine.ingest("local_lockfiles", [_lock("litellm", "1.107.0", "pypi")])
    hit = (await _hits(engine))[("litellm", "1.107.0")]
    assert sorted(hit["signals"]) == ["provenance_repo_changed", "repo_mismatch_declared"]
    assert hit["score"] == 5


async def test_an_ordinary_release_is_not_flagged(engine):
    same = "https://github.com/acme/lib"
    await engine.ingest("npm_packages", [{"name": "lib", "latest_version": "2.1.0", "repo_url": same + ".git"}])
    await engine.ingest("npm_versions", [
        _npm_version("lib", "2.0.0", _ago(days=40), "bot", deps={"a": "1"}, provenance=True, repo=same, size=10_000),
        _npm_version("lib", "2.1.0", _ago(days=1), "bot", deps={"a": "1"}, provenance=True,
                     repo="git+ssh://git@github.com/Acme/Lib.git", size=10_500),
    ])
    await engine.ingest("local_lockfiles", [_lock("lib", "2.1.0")])
    assert await _hits(engine) == {}


async def test_one_weak_signal_alone_is_not_enough(engine):
    await engine.ingest("npm_versions", [
        _npm_version("lib", "1.0.0", _ago(days=30), "bot", deps={"a": "1"}, provenance=True, repo="https://github.com/a/b"),
        _npm_version("lib", "1.1.0", _ago(days=1), "bot", deps={"a": "1", "b": "1"}, provenance=True,
                     repo="https://github.com/a/b"),
    ])
    await engine.ingest("local_lockfiles", [_lock("lib", "1.1.0")])
    assert await _hits(engine) == {}


async def test_missing_data_is_unknown_not_a_change(engine):
    """Nothing collected for a release (NULLs) must never look like dropped provenance or removed dependencies."""
    await engine.ingest("npm_versions", [
        _npm_version("lib", "1.0.0", _ago(days=30), "bot", deps={"a": "1"}, provenance=True, repo="https://github.com/a/b"),
    ])
    await engine.ingest("pypi_versions", [
        {"name": "p", "version": "1", "published_at": _ago(days=30), "has_provenance": True,
         "provenance_repo": "https://github.com/a/b", "dependencies": '["x"]'},
        {"name": "p", "version": "2", "published_at": _ago(days=1)},
    ])
    await engine.ingest("local_lockfiles", [_lock("p", "2", "pypi")])
    assert await _hits(engine) == {}


async def test_old_releases_and_versions_you_do_not_use_are_not_reported(engine):
    await engine.ingest("npm_versions", [
        _npm_version("node-ipc", "12.0.0", _ago(days=900), "a", provenance=False, size=1000),
        _npm_version("node-ipc", "12.0.1", _ago(days=100), "b", provenance=False, size=900_000),
        _npm_version("axios", "1.14.0", _ago(days=30), "j", deps={}, provenance=True, repo="https://github.com/a/b"),
        _npm_version("axios", "1.14.1", _ago(hours=1), "j", deps={"evil": "1"}, provenance=False),
    ])
    # node-ipc 12.0.1 is older than the 30-day window; the project uses axios 1.14.0, not the bad 1.14.1.
    await engine.ingest("local_lockfiles", [_lock("node-ipc", "12.0.1"), _lock("axios", "1.14.0")])
    assert await _hits(engine) == {}


async def test_first_ever_release_has_nothing_to_compare_with(engine):
    await engine.ingest("npm_versions", [_npm_version("brand-new", "1.0.0", _ago(hours=1), "someone",
                                                      deps={"x": "1"}, provenance=False, size=999_999, hook=True)])
    await engine.ingest("local_lockfiles", [_lock("brand-new", "1.0.0")])
    assert await _hits(engine) == {}


async def test_the_install_check_scores_a_single_version_without_needing_a_lockfile(engine):
    await engine.ingest("npm_versions", [
        _npm_version("axios", "1.14.0", _ago(days=230), "j", deps={}, provenance=True, repo="https://github.com/a/b"),
        _npm_version("axios", "1.14.1", _ago(days=200), "j", deps={"evil": "1"}, provenance=False),
    ])
    rows = await engine.query(RELEASE_CHECK_SQL, {"ecosystem": "npm", "pkg": "axios", "version": "1.14.1"})
    assert [(r["score"], sorted(r["signals"])) for r in rows] == [(3, ["dependency_added", "provenance_dropped"])]
    assert await engine.query(RELEASE_CHECK_SQL, {"ecosystem": "npm", "pkg": "axios", "version": "9.9.9"}) == []


async def test_investigation_reports_a_release_anomaly_as_a_high_incident(engine):
    await engine.ingest("npm_versions", [
        _npm_version("node-ipc", "12.0.0", _ago(days=640), "riaevangelist", provenance=False, size=37_000),
        _npm_version("node-ipc", "12.0.1", _ago(hours=2), "atiertant", provenance=False, size=117_000),
    ])
    await engine.ingest("local_lockfiles", [_lock("node-ipc", "12.0.1")])
    result = await investigation_node({"pending_queries": ["RELEASE_ANOMALY"], "token_usage": 0},
                                      coral_engine=engine, llm=None)
    [incident] = result["incidents"]
    assert incident["attack_pattern"] == "release_anomaly" and incident["severity"] == "HIGH"
    assert incident["packages"] == ["node-ipc"]
    assert incident["raw_findings"][0]["signals"]


async def test_a_detection_that_cannot_run_is_reported_not_read_as_nothing_found(engine, monkeypatch):
    from packages.core.agents import investigation

    real_get = investigation.QueryLibrary.get
    monkeypatch.setattr(
        investigation.QueryLibrary, "get",
        classmethod(lambda cls, name, params=None: "SELECT nonexistent_column FROM packages"
                    if name == "RELEASE_ANOMALY" else real_get(name, params)),
    )
    result = await investigation_node(
        {"pending_queries": ["RELEASE_ANOMALY", "MALICIOUS_PACKAGE_MATCH"], "token_usage": 0},
        coral_engine=engine, llm=None,
    )
    assert result["incidents"] == []
    assert list(result["query_errors"]) == ["RELEASE_ANOMALY"]
    assert "nonexistent_column" in result["query_errors"]["RELEASE_ANOMALY"]
    assert "MALICIOUS_PACKAGE_MATCH" in result["query_results"]  # the other checks still ran


async def test_existing_databases_gain_the_new_columns_and_keep_their_rows(tmp_path):
    db = tmp_path / "old.duckdb"
    conn = duckdb.connect(str(db))
    conn.execute("CREATE TABLE npm_versions (name TEXT, version TEXT, published_at TIMESTAMP, published_by TEXT, "
                 "tarball_url TEXT, shasum TEXT, integrity TEXT, dependencies JSON, dev_dependencies JSON, "
                 "has_install_script BOOLEAN, has_postinstall BOOLEAN, has_prepare BOOLEAN, "
                 "attestation_subject_uri TEXT, attestation_predicate_type TEXT, PRIMARY KEY (name, version))")
    conn.execute("CREATE TABLE pypi_versions (name TEXT, version TEXT, published_at TIMESTAMP, published_by TEXT, "
                 "requires_python TEXT, PRIMARY KEY (name, version))")
    conn.execute("INSERT INTO npm_versions (name, version, published_by) VALUES ('old', '1.0.0', 'someone')")
    conn.close()
    eng = CoralEngine(db_path=str(db), snapshot_dir=str(tmp_path / "snaps"))
    try:
        await eng.initialize_schema()
        rows = await eng.query("SELECT name, published_by, has_provenance, dependency_names FROM package_versions")
        assert rows == [{"name": "old", "published_by": "someone", "has_provenance": None, "dependency_names": None}]
        assert await eng.ingest("pypi_versions", [{"name": "p", "version": "1", "has_provenance": True}]) == 1
    finally:
        eng._conn.close()
