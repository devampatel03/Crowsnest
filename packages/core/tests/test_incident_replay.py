"""
Replays of the real 2026 supply-chain incidents through the real code paths.

Each package incident is run twice. First as it looked in the first minutes, when no malware list had heard of it:
the release must already be caught from what changed in it, and held back by the install check. Then after a
feed lists it: the match must be found. A clean earlier release of the same package must pass both ways.

Registry data is shaped the way the adapters collect it (see test_registries.py and test_release_anomaly.py for
the adapters against recorded API responses). Sources are cited beside each incident. Incidents that are not
packages are listed at the bottom, as scope Crowsnest does not claim.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

import pytest
from osv_fakes import FakeOSV

from packages.core.agents.investigation import investigation_node
from packages.core.queries.templates import QueryLibrary
from packages.core.sources.ingestion import IngestorService
from packages.core.sources.osv import OSVSource
from packages.core.veto import evaluate


def _ago(**delta) -> str:
    return (datetime.now(UTC).replace(tzinfo=None) - timedelta(**delta)).isoformat()


class Registry:
    """Hands the engine what the registry adapters would have collected for one package."""

    def __init__(self, tables):
        self.tables = tables

    async def ingest_registry_metadata(self, refs, engine, focus=None):
        for table, rows in self.tables.items():
            await engine.ingest(table, rows)
        return 1


def _lock(eco, package, version):
    return {"project_path": "/app", "ecosystem": eco, "package": package, "version": version,
            "integrity_hash": "", "resolved_url": "", "declared_in": "direct", "parent_chain": []}


def _npm(name, version, published, by, *, deps=None, provenance=False, repo=None, size=None):
    return {"name": name, "version": version, "published_at": published, "published_by": by,
            "dependencies": json.dumps(deps or {}), "has_provenance": provenance, "provenance_repo": repo,
            "unpacked_size": size, "has_install_script": False}


def _pypi(name, version, published, *, deps, provenance, repo, size):
    return {"name": name, "version": version, "published_at": published, "dependencies": json.dumps(deps),
            "has_provenance": provenance, "provenance_repo": repo, "unpacked_size": size}


def _incident(engine_tables, eco, package, bad, good, osv_eco, advisory):
    return {"tables": engine_tables, "eco": eco, "package": package, "bad": bad, "good": good,
            "osv": (osv_eco, package, bad), "advisory": advisory}


def _litellm():
    """litellm 1.107.0, 2026-10-21: built by the real pipeline from a fork one hyphen off the real repository.
    Live on PyPI 11:39 to 13:23 UTC (1h44m). Sources: Help Net Security 2026-10-22; Wiz; LiteLLM security update."""
    real, fork = "https://github.com/BerriAI/litellm", "https://github.com/Berri-AI/litellm"
    tables = {
        "pypi_packages": [{"name": "litellm", "latest_version": "1.107.0", "weekly_downloads": 23_000_000,
                           "repo_url": real, "created_at": _ago(days=1000)}],
        "pypi_versions": [
            _pypi("litellm", "1.106.2", _ago(days=9), deps=["httpx", "openai"], provenance=True, repo=real, size=5000),
            _pypi("litellm", "1.107.0", _ago(hours=1.7), deps=["httpx", "openai"], provenance=True, repo=fork, size=5100),
        ],
    }
    return _incident(tables, "pypi", "litellm", "1.107.0", "1.106.2", "PyPI", "MAL-2026-2144")


def _axios():
    """axios 1.14.1, 2026-03-30/31: lead maintainer's account hijacked; the release added a dependency and was
    published without the build proof earlier releases had. Source: Trend Micro, 2026-03."""
    repo = "https://github.com/axios/axios"
    tables = {
        "npm_packages": [{"name": "axios", "latest_version": "1.14.1", "weekly_downloads": 100_000_000,
                          "repo_url": repo, "created_at": _ago(days=4000)}],
        "npm_versions": [
            _npm("axios", "1.14.0", _ago(days=30), "jasonsaayman", deps={"follow-redirects": "1", "form-data": "4"},
                 provenance=True, repo=repo, size=400_000),
            _npm("axios", "1.14.1", _ago(hours=3), "jasonsaayman",
                 deps={"follow-redirects": "1", "form-data": "4", "plain-crypto-js": "4"}, size=401_000),
        ],
    }
    return _incident(tables, "npm", "axios", "1.14.1", "1.14.0", "npm", "MAL-2026-2307")


def _node_ipc():
    """node-ipc 12.0.1, 2026-05-14: a publisher who never released it before, after 21 months of silence, and
    a bundle that grew from 37 KB to 117 KB. No install script. Source: StepSecurity, 2026-05-14."""
    tables = {
        "npm_packages": [{"name": "node-ipc", "latest_version": "12.0.1", "weekly_downloads": 800_000,
                          "repo_url": "https://github.com/RIAEvangelist/node-ipc", "created_at": _ago(days=3000)}],
        "npm_versions": [
            _npm("node-ipc", "12.0.0", _ago(days=640), "riaevangelist", size=37_000),
            _npm("node-ipc", "12.0.1", _ago(hours=2), "atiertant", size=117_000),
        ],
    }
    return _incident(tables, "npm", "node-ipc", "12.0.1", "12.0.0", "npm", "MAL-2026-3744")


PACKAGE_INCIDENTS = [pytest.param(f, id=f.__name__.strip("_")) for f in (_litellm, _axios, _node_ipc)]


async def _install_check(engine, incident, version):
    """What `crowsnest install` would say with the malware list still silent."""
    return await evaluate(
        engine, package=incident["package"], version=version, ecosystem=incident["eco"], live=True,
        ingestor=Registry(incident["tables"]), osv=OSVSource(transport=FakeOSV({}).transport()),
    )


@pytest.mark.parametrize("make", PACKAGE_INCIDENTS)
async def test_caught_from_what_changed_before_any_malware_list_knows_it(engine, make):
    incident = make()
    for table, rows in incident["tables"].items():
        await engine.ingest(table, rows)
    await engine.ingest("local_lockfiles", [_lock(incident["eco"], incident["package"], incident["bad"])])

    # A scan flags the release in the project, with no help from any feed.
    result = await investigation_node({"pending_queries": ["RELEASE_ANOMALY"], "token_usage": 0},
                                      coral_engine=engine, llm=None)
    [found] = result["incidents"]
    assert found["attack_pattern"] == "release_anomaly" and found["severity"] == "HIGH"
    assert found["packages"] == [incident["package"]]

    # The install check stops it for two reasons that need no feed: its changes, and its age.
    verdict = await _install_check(engine, incident, incident["bad"])
    assert verdict["blocked"] is True
    assert any("Release looks hijacked" in s for s in verdict["signals"])
    assert any("policy is to wait" in s for s in verdict["signals"])


@pytest.mark.parametrize("make", PACKAGE_INCIDENTS)
async def test_caught_once_a_malware_list_names_it(engine, make):
    incident = make()
    await engine.ingest("local_lockfiles", [_lock(incident["eco"], incident["package"], incident["bad"])])
    service = IngestorService()
    service._osv = OSVSource(transport=FakeOSV({incident["osv"]: [incident["advisory"]]}).transport())
    await service.ingest_malware_feed(engine)
    result = await investigation_node({"pending_queries": ["MALICIOUS_PACKAGE_MATCH"], "token_usage": 0},
                                      coral_engine=engine, llm=None)
    [found] = result["incidents"]
    assert found["attack_pattern"] == "ioc_match" and found["severity"] == "CRITICAL"
    assert found["packages"] == [incident["package"]]
    assert [b["project_path"] for b in found["blast_radius"]] == ["/app"]


@pytest.mark.parametrize("make", PACKAGE_INCIDENTS)
async def test_the_clean_release_before_it_passes_both_ways(engine, make):
    incident = make()
    for table, rows in incident["tables"].items():
        await engine.ingest(table, rows)
    await engine.ingest("local_lockfiles", [_lock(incident["eco"], incident["package"], incident["good"])])
    service = IngestorService()
    service._osv = OSVSource(transport=FakeOSV({incident["osv"]: [incident["advisory"]]}).transport())
    await service.ingest_malware_feed(engine)
    result = await investigation_node(
        {"pending_queries": ["RELEASE_ANOMALY", "MALICIOUS_PACKAGE_MATCH"], "token_usage": 0},
        coral_engine=engine, llm=None,
    )
    assert result["incidents"] == []
    verdict = await _install_check(engine, incident, incident["good"])
    assert verdict["blocked"] is False


async def test_the_keyv_worm_is_caught_when_one_account_publishes_a_burst(engine):
    """CHAINDROP, 2026-08-04: a stolen token published to every package its owner could reach. Source: Wiz, Chainguard."""
    await engine.ingest("local_lockfiles", [_lock("npm", "keyv", "5.9.9")])
    await engine.ingest("npm_publish_events", [
        {"package": "keyv" if i == 0 else f"cache-{i}", "version": "9.9.9", "published_by": "jaredwray",
         "published_at": _ago(minutes=60, seconds=-20 * i), "publish_via": "npm"} for i in range(40)
    ])
    result = await investigation_node({"pending_queries": ["SHAI_HULUD"], "token_usage": 0},
                                      coral_engine=engine, llm=None)
    [found] = result["incidents"]
    assert found["attack_pattern"] == "worm" and found["severity"] == "CRITICAL"
    assert "keyv" in found["packages"]


async def test_publish_events_with_no_known_publisher_are_not_a_worm(engine):
    await engine.ingest("npm_publish_events", [
        {"package": f"pkg-{i}", "version": "1.0.0", "published_by": "", "published_at": _ago(minutes=30, seconds=-5 * i),
         "publish_via": "firehose"} for i in range(40)
    ])
    assert await engine.query(QueryLibrary.get("SHAI_HULUD")) == []


async def test_a_typosquat_of_a_popular_package_is_caught(engine):
    """The vpmdhaj campaign, 2026-05-28: 14 look-alike packages in four hours. Source: Microsoft Security Blog."""
    await engine.ingest("npm_packages", [
        {"name": "react", "weekly_downloads": 30_000_000, "created_at": _ago(days=4000)},
        {"name": "reactt", "weekly_downloads": 12, "created_at": _ago(days=1)},
    ])
    await engine.ingest("local_lockfiles", [_lock("npm", "reactt", "1.0.0")])
    result = await investigation_node({"pending_queries": ["TYPOSQUAT_DISTANCE"], "token_usage": 0},
                                      coral_engine=engine, llm=None)
    [found] = result["incidents"]
    assert found["attack_pattern"] == "typosquat" and found["packages"] == ["reactt"]


async def test_a_poisoned_build_pipeline_is_caught(engine):
    """TanStack-style, 2026-05-11: a pull-request-triggered workflow minted a publish token for a signed release."""
    await engine.ingest("local_lockfiles", [_lock("npm", "@tanstack/router", "1.2.3")])
    await engine.ingest("npm_versions", [{
        "name": "@tanstack/router", "version": "1.2.3", "published_at": _ago(hours=1), "published_by": "ci",
        "tarball_url": "t", "attestation_subject_uri": "sub", "attestation_predicate_type": "slsa",
    }])
    await engine.ingest("sigstore_rekor", [{"log_index": 1, "integrated_time": _ago(hours=1), "subject": "t",
                                            "build_invocation_id": "run1", "attested_predicate": "{}"}])
    await engine.ingest("gh_actions_runs", [{
        "repo": "tanstack/router", "workflow": ".github/workflows/release.yml", "run_id": "run1",
        "started_at": _ago(hours=1), "finished_at": _ago(minutes=50), "conclusion": "success",
        "triggered_by": "pull_request_target", "oidc_audience": "npm",
        "oidc_subject": "repo:tanstack/router:ref:refs/pull/1/merge",
    }])
    await engine.ingest("gh_workflow_files", [{
        "repo": "tanstack/router", "path": ".github/workflows/release.yml", "ref": "main",
        "declared_actions": ["actions/cache"], "has_pwn_request_pattern": True,
    }])
    result = await investigation_node(
        {"pending_queries": ["SLSA_POISONING", "OIDC_TOKEN_MISUSE"], "token_usage": 0}, coral_engine=engine, llm=None,
    )
    assert {i["attack_pattern"] for i in result["incidents"]} == {"slsa_poisoning", "oidc_misuse"}


async def test_a_healthy_project_raises_nothing_from_any_check(engine):
    """False-positive guard: ordinary, well-run packages on every check Crowsnest has."""
    repo = "https://github.com/acme/lib"
    await engine.ingest("npm_packages", [
        {"name": "lib", "latest_version": "2.1.0", "weekly_downloads": 5_000_000, "repo_url": repo,
         "maintainers": ["acme-bot"], "created_at": _ago(days=2000), "updated_at": _ago(days=3)},
    ])
    await engine.ingest("npm_versions", [
        _npm("lib", "2.0.0", _ago(days=40), "acme-bot", deps={"a": "1"}, provenance=True, repo=repo, size=10_000),
        _npm("lib", "2.1.0", _ago(days=3), "acme-bot", deps={"a": "1"}, provenance=True, repo=repo, size=10_400),
    ])
    await engine.ingest("pypi_packages", [{"name": "solid", "latest_version": "3.0", "weekly_downloads": 9_000_000,
                                           "repo_url": "https://github.com/acme/solid", "created_at": _ago(days=3000),
                                           "updated_at": _ago(days=5)}])
    await engine.ingest("pypi_versions", [
        _pypi("solid", "2.9", _ago(days=50), deps=["x"], provenance=True, repo="https://github.com/acme/solid", size=900),
        _pypi("solid", "3.0", _ago(days=5), deps=["x"], provenance=True, repo="https://github.com/acme/solid", size=910),
    ])
    await engine.ingest("local_lockfiles", [_lock("npm", "lib", "2.1.0"), _lock("pypi", "solid", "3.0")])
    service = IngestorService()
    service._osv = OSVSource(transport=FakeOSV({}).transport())
    await service.ingest_malware_feed(engine)
    everything = [q for q in QueryLibrary.list_queries() if q != "BLAST_RADIUS"]
    result = await investigation_node({"pending_queries": everything, "token_usage": 0}, coral_engine=engine, llm=None)
    assert result["incidents"] == []


@pytest.mark.parametrize("incident", [
    "Railway: stored environment variables may have been decrypted (2026-10-21)",
    "eMudhra: certificate authority keys recoverable (2026-10-21)",
    "PHP2Shell: use-after-free in the PHP interpreter (2026-10-21)",
    "GitLab CVE-2026-110264: unauthenticated remote code execution (2026-10-21)",
])
async def test_platform_incidents_are_not_package_findings(engine, incident):
    """Out of scope for release 1, and honest about it: none of these is a package in a lockfile, so no check
    fires. They are the subject of the platform-exposure design (docs: Vision 3). This test fails the day
    one of them starts producing findings, so the claim is updated deliberately, not by accident."""
    await engine.ingest("local_lockfiles", [_lock("npm", "express", "4.19.2")])
    everything = [q for q in QueryLibrary.list_queries() if q != "BLAST_RADIUS"]
    result = await investigation_node({"pending_queries": everything, "token_usage": 0}, coral_engine=engine, llm=None)
    assert result["incidents"] == [], incident
