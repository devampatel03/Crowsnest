"""The install veto: malware listing, hijack signals, minimum release age, and degraded lookups."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from osv_fakes import MAL_LITELLM, FakeOSV

from packages.core.sources.osv import OSVSource
from packages.core.veto import evaluate, is_exact_version


def _ago(**delta) -> str:
    return (datetime.now(UTC).replace(tzinfo=None) - timedelta(**delta)).isoformat()


class FakeIngestor:
    """Stands in for the registries: ingesting a package loads whatever rows the test prepared."""

    def __init__(self, tables=None, fail=False):
        self.tables = tables or {}
        self.fail = fail
        self.asked: list[tuple[str, str]] = []
        self.focus: list[dict | None] = []

    async def ingest_registry_metadata(self, refs, engine, focus=None):
        self.asked += list(refs)
        self.focus.append(focus)
        if self.fail:
            raise RuntimeError("registry offline")
        for table, rows in self.tables.items():
            await engine.ingest(table, rows)
        return sum(len(r) for r in self.tables.values())


def _npm_package(name, latest, created_days=2000, downloads=5_000_000, repo="https://github.com/a/b"):
    return {"name": name, "latest_version": latest, "weekly_downloads": downloads, "repo_url": repo,
            "created_at": _ago(days=created_days)}


def _npm_version(name, version, published, by="jason", deps=None, provenance=None, repo=None):
    return {"name": name, "version": version, "published_at": published, "published_by": by,
            "dependencies": json.dumps(deps or {}), "has_provenance": provenance, "provenance_repo": repo}


async def _veto(engine, ingestor=None, osv=None, **kwargs):
    kwargs.setdefault("package", "axios")
    return await evaluate(engine, ingestor=ingestor or FakeIngestor(), osv=osv, **kwargs)


@pytest.mark.parametrize(("spec", "exact"), [
    ("1.2.3", True), ("v1.2.3", True), ("1.2.3-rc.1", True), ("2", True), ("^1.2.0", False),
    ("~1.2", False), (">=1", False), ("latest", False), ("", False), (None, False), ("1.x", False),
])
def test_is_exact_version(spec, exact):
    assert is_exact_version(spec) is exact


async def test_a_version_the_feed_lists_as_malicious_is_blocked_even_if_everything_else_looks_fine(engine):
    ingestor = FakeIngestor({
        "npm_packages": [_npm_package("axios", "1.14.1")],
        "npm_versions": [_npm_version("axios", "1.14.1", _ago(days=400))],
    })
    osv = OSVSource(transport=FakeOSV({("npm", "axios", "1.14.1"): ["MAL-2026-2307"]}).transport())
    verdict = await _veto(engine, ingestor, osv, version="1.14.1")
    assert verdict["blocked"] is True and verdict["probability"] == 1.0
    assert verdict["signals"][0].startswith("ACTIVE IOC: axios@1.14.1 is listed as malicious")
    assert "MAL-2026-2307" in verdict["signals"][0]
    assert verdict["override_flag"] == "--crowsnest-acknowledge-risk"


async def test_a_clean_old_version_is_approved(engine):
    ingestor = FakeIngestor({
        "npm_packages": [_npm_package("axios", "1.14.0")],
        "npm_versions": [_npm_version("axios", "1.14.0", _ago(days=400))],
    })
    verdict = await _veto(engine, ingestor, OSVSource(transport=FakeOSV({}).transport()), version="1.14.0")
    assert verdict["blocked"] is False and verdict["signals"] == [] and verdict["degraded"] == []
    assert verdict["release_age_hours"] > 24 * 300


async def test_the_malware_listing_is_found_for_the_stored_feed_without_going_online(engine):
    await engine.ingest("npm_packages", [_npm_package("axios", "1.14.1")])
    await engine.ingest("ossf_malicious_packages", [
        {"ecosystem": "npm", "package": "axios", "version": "1.14.1", "classification": "malicious",
         "ioc_hashes": [], "first_reported": _ago(days=1), "sources": ["MAL-2026-2307"]},
    ])
    verdict = await _veto(engine, live=False, version="1.14.1")
    assert verdict["blocked"] is True and "MAL-2026-2307" in verdict["signals"][0]


async def test_a_pypi_package_is_matched_by_its_normalised_name(engine):
    ingestor = FakeIngestor({
        "pypi_packages": [{"name": "litellm", "latest_version": "1.107.0", "weekly_downloads": 20_000_000,
                           "repo_url": "https://github.com/BerriAI/litellm", "created_at": _ago(days=1000)}],
        "pypi_versions": [{"name": "litellm", "version": "1.107.0", "published_at": _ago(days=400)}],
    })
    osv = OSVSource(transport=FakeOSV({("PyPI", "litellm", "1.107.0"): [MAL_LITELLM]}).transport())
    verdict = await _veto(engine, ingestor, osv, package="LiteLLM", ecosystem="PyPI", version="1.107.0")
    assert verdict["blocked"] is True and verdict["ecosystem"] == "pypi"


async def test_a_version_published_hours_ago_is_held_back_by_the_minimum_release_age(engine):
    ingestor = FakeIngestor({
        "npm_packages": [_npm_package("lib", "2.0.0")],
        "npm_versions": [_npm_version("lib", "2.0.0", _ago(hours=3))],
    })
    osv = OSVSource(transport=FakeOSV({}).transport())
    held = await _veto(engine, ingestor, osv, package="lib", version="2.0.0", min_release_age_days=2)
    assert held["blocked"] is True and held["probability"] == 0.0
    assert "published 3 hours ago" in held["reason"] and "wait 2 days" in held["reason"]
    allowed = await _veto(engine, ingestor, osv, package="lib", version="2.0.0", min_release_age_days=0)
    assert allowed["blocked"] is False


async def test_the_age_rule_would_have_kept_out_every_2026_compromise(engine):
    """Each was live for under three hours (litellm 1h44m on PyPI), well inside a two day wait."""
    for live_hours in (0.5, 1.7, 2.6):
        verdict = await _veto(
            engine,
            FakeIngestor({
                "npm_packages": [_npm_package("pkg", "9.9.9")],
                "npm_versions": [_npm_version("pkg", "9.9.9", _ago(hours=live_hours))],
            }),
            OSVSource(transport=FakeOSV({}).transport()),
            package="pkg", version="9.9.9",
        )
        assert verdict["blocked"] is True


async def test_a_hijacked_looking_release_is_blocked_by_its_changes(engine):
    ingestor = FakeIngestor({
        "npm_packages": [_npm_package("axios", "1.14.1")],
        "npm_versions": [
            _npm_version("axios", "1.14.0", _ago(days=230), deps={"a": "1"}, provenance=True, repo="https://github.com/a/b"),
            _npm_version("axios", "1.14.1", _ago(days=200), deps={"a": "1", "plain-crypto-js": "4"}, provenance=False),
        ],
    })
    verdict = await _veto(engine, ingestor, OSVSource(transport=FakeOSV({}).transport()), version="1.14.1")
    assert verdict["blocked"] is True
    assert any("Release looks hijacked: " in s and "provenance_dropped" in s for s in verdict["signals"])


async def test_a_range_is_checked_against_the_latest_version(engine):
    ingestor = FakeIngestor({
        "npm_packages": [_npm_package("axios", "1.14.1")],
        "npm_versions": [_npm_version("axios", "1.14.1", _ago(days=400))],
    })
    osv = OSVSource(transport=FakeOSV({("npm", "axios", "1.14.1"): ["MAL-2026-2307"]}).transport())
    verdict = await _veto(engine, ingestor, osv, version="^1.14.0")
    assert verdict["blocked"] is True and verdict["version"] == "1.14.1"


async def test_an_unreachable_malware_feed_is_reported_and_never_reads_as_clean(engine):
    def down(request):
        raise httpx.ConnectError("offline", request=request)

    ingestor = FakeIngestor({
        "npm_packages": [_npm_package("axios", "1.14.0")],
        "npm_versions": [_npm_version("axios", "1.14.0", _ago(days=400))],
    })
    verdict = await _veto(engine, ingestor, OSVSource(transport=httpx.MockTransport(down)), version="1.14.0")
    assert verdict["blocked"] is False
    assert any("malware feed unreachable" in d for d in verdict["degraded"])


async def test_a_release_check_that_cannot_run_is_reported(engine, monkeypatch):
    from packages.core import veto

    monkeypatch.setattr(veto, "RELEASE_CHECK_SQL", "SELECT nonexistent_column FROM packages")
    ingestor = FakeIngestor({
        "npm_packages": [_npm_package("axios", "1.14.0")],
        "npm_versions": [_npm_version("axios", "1.14.0", _ago(days=400))],
    })
    verdict = await _veto(engine, ingestor, OSVSource(transport=FakeOSV({}).transport()), version="1.14.0")
    assert verdict["blocked"] is False
    assert any("release check could not run" in d for d in verdict["degraded"])


async def test_a_registry_that_cannot_be_reached_is_reported(engine):
    verdict = await _veto(engine, FakeIngestor(fail=True), OSVSource(transport=FakeOSV({}).transport()),
                          package="mystery", version="1.0.0")
    assert "registry data could not be refreshed" in verdict["degraded"]
    assert verdict["blocked"] is False  # nothing known against it, but the caller is told what was not checked


async def test_unknown_download_counts_are_not_few_downloads(engine):
    ingestor = FakeIngestor({
        "pypi_packages": [{"name": "obscure", "latest_version": "1.0", "weekly_downloads": None,
                           "repo_url": "https://github.com/a/b", "created_at": _ago(days=900)}],
        "pypi_versions": [{"name": "obscure", "version": "1.0", "published_at": _ago(days=400)}],
    })
    verdict = await _veto(engine, ingestor, OSVSource(transport=FakeOSV({}).transport()),
                          package="obscure", ecosystem="pypi", version="1.0")
    assert not any("weekly downloads" in s for s in verdict["signals"])


async def test_release_details_are_collected_for_the_version_being_checked(engine):
    ingestor = FakeIngestor({"npm_packages": [_npm_package("axios", "1.14.1")]})
    osv = OSVSource(transport=FakeOSV({}).transport())
    await _veto(engine, ingestor, osv, version="1.14.1")
    assert ingestor.focus == [{("npm", "axios"): ["1.14.1"]}]
    await _veto(engine, ingestor, osv, version="^1.14.0")  # a range names no version, so the newest are collected
    assert ingestor.focus[-1] is None


async def test_a_second_check_does_not_hit_the_registry_again_within_ten_minutes(engine):
    ingestor = FakeIngestor({"npm_packages": [_npm_package("cached-pkg", "1.0.0")]})
    osv = OSVSource(transport=FakeOSV({}).transport())
    await _veto(engine, ingestor, osv, package="cached-pkg", version="1.0.0")
    await _veto(engine, ingestor, osv, package="cached-pkg", version="1.0.0")
    assert ingestor.asked == [("npm", "cached-pkg")]
