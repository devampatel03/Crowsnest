"""Registry adapters, driven by canned responses shaped like each registry's real API."""

from __future__ import annotations

import httpx
import pytest

from packages.core.sources.ingestion import IngestorService
from packages.core.sources.npm import NpmRegistrySource
from packages.core.sources.pypi import PyPISource
from packages.core.sources.registries import (
    CratesIoSource,
    GoProxySource,
    PackagistSource,
    RubyGemsSource,
    escape_go_module,
    parse_ts,
)


def _transport(routes: dict[str, object]) -> httpx.MockTransport:
    """Serve `routes` by URL path; a str is a plain-text body, anything else JSON; missing paths are 404."""

    def handler(request: httpx.Request) -> httpx.Response:
        body = routes.get(request.url.path)
        if body is None:
            return httpx.Response(404)
        if isinstance(body, str):
            return httpx.Response(200, text=body)
        return httpx.Response(200, json=body)

    return httpx.MockTransport(handler)


def _by_table(records):
    out: dict[str, list[dict]] = {}
    for r in records:
        out.setdefault(r["_table"], []).append(r)
    return out


async def test_crates_io_maps_crate_and_versions():
    transport = _transport({"/api/v1/crates/serde": {
        "crate": {"name": "serde", "max_version": "1.0.9", "max_stable_version": "1.0.8",
                  "recent_downloads": 1300, "repository": "https://github.com/serde-rs/serde",
                  "created_at": "2015-01-01T00:00:00Z", "updated_at": "2026-10-01T00:00:00Z"},
        "versions": [
            {"num": "1.0.8", "created_at": "2026-10-01T00:00:00Z", "license": "MIT",
             "published_by": {"login": "dtolnay"}},
            {"num": "1.0.7", "created_at": "2026-09-01T00:00:00Z", "license": "MIT", "published_by": None},
        ],
    }})
    records = await CratesIoSource(transport=transport).fetch(package="serde")
    tables = _by_table(records)
    pkg = tables["registry_packages"][0]
    assert (pkg["ecosystem"], pkg["name"], pkg["latest_version"]) == ("cargo", "serde", "1.0.8")
    assert pkg["weekly_downloads"] == 100
    assert pkg["maintainers"] == ["dtolnay"]
    assert {v["version"] for v in tables["registry_versions"]} == {"1.0.8", "1.0.7"}
    assert tables["registry_versions"][0]["published_by"] == "dtolnay"


async def test_packagist_ignores_dev_branches_and_lowercases_the_name():
    transport = _transport({"/packages/vendor/pkg.json": {"package": {
        "name": "vendor/pkg", "repository": "https://github.com/vendor/pkg",
        "maintainers": [{"name": "alice"}], "downloads": {"monthly": 430},
        "versions": {
            "dev-main": {"time": "2026-10-20T00:00:00+00:00"},
            "2.0.0": {"time": "2026-10-01T00:00:00+00:00"},
            "1.0.0": {"time": "2020-01-01T00:00:00+00:00"},
        },
    }}})
    records = await PackagistSource(transport=transport).fetch(package="Vendor/Pkg")
    tables = _by_table(records)
    pkg = tables["registry_packages"][0]
    assert (pkg["name"], pkg["latest_version"], pkg["weekly_downloads"]) == ("vendor/pkg", "2.0.0", 100)
    assert pkg["created_at"].year == 2020
    assert {v["version"] for v in tables["registry_versions"]} == {"2.0.0", "1.0.0"}


async def test_rubygems_collapses_platform_variants_and_leaves_downloads_unknown():
    transport = _transport({
        "/api/v1/gems/rails.json": {"name": "rails", "version": "8.0.0", "licenses": ["MIT"],
                                    "source_code_uri": "https://github.com/rails/rails"},
        "/api/v1/versions/rails.json": [
            {"number": "8.0.0", "created_at": "2026-10-01T00:00:00.000Z", "platform": "ruby"},
            {"number": "8.0.0", "created_at": "2026-10-01T00:00:00.000Z", "platform": "java"},
            {"number": "7.0.0", "created_at": "2022-01-01T00:00:00.000Z", "platform": "ruby"},
        ],
        "/api/v1/gems/rails/owners.json": [{"handle": "dhh"}],
    })
    tables = _by_table(await RubyGemsSource(transport=transport).fetch(package="rails"))
    pkg = tables["registry_packages"][0]
    assert pkg["weekly_downloads"] is None
    assert pkg["maintainers"] == ["dhh"]
    assert sorted(v["version"] for v in tables["registry_versions"]) == ["7.0.0", "8.0.0"]


async def test_go_proxy_keeps_recent_versions_and_escapes_uppercase_paths():
    assert escape_go_module("github.com/Azure/azure-sdk") == "github.com/!azure/azure-sdk"
    base = "/github.com/!azure/azure-sdk/@v"
    transport = _transport({
        f"{base}/list": "v1.2.0\nv1.10.0\nv1.9.0\n",
        "/github.com/!azure/azure-sdk/@latest": {"Version": "v1.10.0"},
        f"{base}/v1.2.0.info": {"Version": "v1.2.0", "Time": "2024-01-01T00:00:00Z"},
        f"{base}/v1.9.0.info": {"Version": "v1.9.0", "Time": "2025-01-01T00:00:00Z"},
        f"{base}/v1.10.0.info": {"Version": "v1.10.0", "Time": "2026-01-01T00:00:00Z"},
    })
    tables = _by_table(await GoProxySource(transport=transport).fetch(package="github.com/Azure/azure-sdk"))
    pkg = tables["registry_packages"][0]
    assert pkg["latest_version"] == "v1.10.0"
    assert pkg["repo_url"] == "https://github.com/Azure/azure-sdk"
    assert pkg["created_at"].year == 2024
    assert len(tables["registry_versions"]) == 3


@pytest.mark.parametrize("cls", [CratesIoSource, PackagistSource, RubyGemsSource, GoProxySource])
async def test_unknown_package_and_outage_give_no_records(cls):
    assert await cls(transport=_transport({})).fetch(package="nope") == []

    def broken(request):
        raise httpx.ConnectError("down", request=request)

    assert await cls(transport=httpx.MockTransport(broken)).fetch(package="nope") == []


async def test_pypi_dates_the_package_and_leaves_unknown_downloads_null():
    transport = _transport({
        "/pypi/litellm/json": {
            "info": {"version": "1.106.2", "author": "Berri", "license": "MIT", "requires_python": ">=3.9",
                     "project_urls": {"Source": "https://github.com/BerriAI/litellm.git/"}},
            "releases": {
                "1.0.0": [{"upload_time_iso_8601": "2023-08-01T10:00:00.000000Z"}],
                "1.106.2": [{"upload_time_iso_8601": "2026-10-01T10:00:00.000000Z"},
                            {"upload_time_iso_8601": "2026-10-01T09:00:00.000000Z"}],
                "0.0.1": [],
            },
        },
    })
    records = await PyPISource(transport=transport).fetch(package="LiteLLM")
    tables = _by_table(records)
    pkg = tables["pypi_packages"][0]
    assert pkg["name"] == "litellm"
    assert pkg["weekly_downloads"] is None
    assert pkg["created_at"].year == 2023 and pkg["updated_at"].year == 2026
    assert pkg["repo_url"] == "https://github.com/BerriAI/litellm"
    versions = {v["version"]: v for v in tables["pypi_versions"]}
    assert set(versions) == {"1.0.0", "1.106.2"}
    assert versions["1.106.2"]["published_at"].hour == 9


async def test_weekly_downloads_are_read_when_the_stats_service_answers():
    pypi = PyPISource(transport=_transport({"/api/packages/requests/recent": {"data": {"last_week": 42}}}))
    npm = NpmRegistrySource(transport=_transport({"/downloads/point/last-week/left-pad": {"downloads": 7}}))
    assert await pypi.weekly_downloads("requests") == 42
    assert await npm.weekly_downloads("left-pad") == 7
    assert await pypi.weekly_downloads("missing") is None
    assert await npm.weekly_downloads("missing") is None


def test_parse_ts_returns_naive_utc():
    assert parse_ts("2026-10-21T11:39:00Z").isoformat() == "2026-10-21T11:39:00"
    assert parse_ts("2026-10-21T13:39:00+02:00").isoformat() == "2026-10-21T11:39:00"
    assert parse_ts("not a date") is None and parse_ts(None) is None


class _FakeSource:
    def __init__(self, records):
        self.records = records
        self.asked: list[str] = []

    async def fetch(self, package: str = "", **_):
        self.asked.append(package)
        return [dict(r) for r in self.records]


async def test_ingest_routes_each_ecosystem_to_its_adapter_and_tables(engine):
    when = "2026-10-01T00:00:00"
    service = IngestorService()
    service._npm = _FakeSource([
        {"_table": "npm_packages", "name": "axios", "latest_version": "1.14.0"},
        {"_table": "npm_versions", "name": "axios", "version": "1.14.0", "published_at": when},
    ])
    service._pypi = _FakeSource([
        {"_table": "pypi_packages", "name": "litellm", "latest_version": "1.106.2"},
        {"_table": "pypi_versions", "name": "litellm", "version": "1.106.2", "published_at": when},
    ])
    service._registries = {"cargo": _FakeSource([
        {"_table": "registry_packages", "ecosystem": "cargo", "name": "serde", "latest_version": "1.0.0"},
        {"_table": "registry_versions", "ecosystem": "cargo", "name": "serde", "version": "1.0.0",
         "published_at": when},
    ])}
    inserted = await service.ingest_registry_metadata(
        [("npm", "axios"), ("pypi", "litellm"), ("cargo", "serde"), ("maven", "g:a")], engine,
    )
    assert inserted == 6
    rows = await engine.query("SELECT ecosystem, name, version FROM package_versions ORDER BY ecosystem")
    assert [(r["ecosystem"], r["name"], r["version"]) for r in rows] == [
        ("cargo", "serde", "1.0.0"), ("npm", "axios", "1.14.0"), ("pypi", "litellm", "1.106.2"),
    ]


async def test_one_failing_package_does_not_lose_the_others(engine):
    class Boom:
        async def fetch(self, package: str = "", **_):
            raise RuntimeError("registry exploded")

    service = IngestorService()
    service._npm = Boom()
    service._pypi = _FakeSource([{"_table": "pypi_packages", "name": "requests", "latest_version": "2"}])
    inserted = await service.ingest_registry_metadata([("npm", "a"), ("pypi", "requests")], engine)
    assert inserted == 1


async def test_full_ingest_caps_each_ecosystem_and_prefers_direct_dependencies(engine, monkeypatch):
    from packages.core.sources import ingestion

    monkeypatch.setattr(ingestion, "_MAX_PACKAGES_PER_ECOSYSTEM", 2)
    rows = [
        {"project_path": "/p", "ecosystem": "npm", "package": name, "version": "1.0.0", "integrity_hash": "",
         "resolved_url": "", "declared_in": declared, "parent_chain": []}
        for name, declared in [("a-transitive", "transitive"), ("b-transitive", "transitive"),
                               ("z-direct", "direct"), ("y-direct", "direct")]
    ]
    await engine.ingest("local_lockfiles", rows)
    service = IngestorService()
    npm = _FakeSource([])
    service._npm = npm
    for name in ("_osv", "_socket"):
        setattr(service, name, type("N", (), {
            "fetch_batch": staticmethod(lambda *a, **k: _empty()),
            "fetch_batch_scores": staticmethod(lambda *a, **k: _empty()),
        })())
    service.ingest_lockfile = lambda *a, **k: _zero()
    service.ingest_npm_publish_events = lambda *a, **k: _zero()
    totals = await service.full_ingest("/p", engine)
    assert sorted(npm.asked) == ["y-direct", "z-direct"]
    assert totals["registry_skipped"] == 2


async def _empty():
    return []


async def _zero():
    return 0

