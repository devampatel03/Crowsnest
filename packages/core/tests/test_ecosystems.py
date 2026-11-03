"""Ecosystem naming, and the ecosystem-neutral package views."""

from __future__ import annotations

import pytest

from packages.core.ecosystems import (
    ECOSYSTEMS,
    normalize_ecosystem,
    normalize_package_name,
    osv_ecosystem,
)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("npm", "npm"), ("NPM", "npm"), ("PyPI", "pypi"), ("pip", "pypi"), ("crates.io", "cargo"),
        ("cargo", "cargo"), ("Go", "go"), ("Maven", "maven"), ("Packagist", "composer"),
        ("composer", "composer"), ("RubyGems", "rubygems"), (" gem ", "rubygems"),
    ],
)
def test_normalize_ecosystem(raw, expected):
    assert normalize_ecosystem(raw) == expected


@pytest.mark.parametrize("raw", [None, "", "left-pad", "docker"])
def test_unknown_ecosystem_is_none(raw):
    assert normalize_ecosystem(raw) is None


def test_every_ecosystem_has_an_osv_name_that_round_trips():
    for eco in ECOSYSTEMS:
        assert normalize_ecosystem(osv_ecosystem(eco)) == eco


def test_pypi_names_compare_the_way_pypi_does():
    assert normalize_package_name("pypi", "Foo_Bar.baz") == "foo-bar-baz"
    assert normalize_package_name("pypi", "foo--bar") == "foo-bar"
    assert normalize_package_name("composer", "Vendor/Package") == "vendor/package"
    assert normalize_package_name("npm", "@Scope/Name") == "@Scope/Name"


async def test_packages_view_spans_every_registry(engine):
    await engine.ingest("npm_packages", [{"name": "left-pad", "latest_version": "1.3.0", "weekly_downloads": 5}])
    await engine.ingest("pypi_packages", [{"name": "requests", "latest_version": "2.32.0", "weekly_downloads": 7}])
    await engine.ingest("registry_packages", [
        {"ecosystem": "cargo", "name": "serde", "latest_version": "1.0.0", "weekly_downloads": 9},
    ])
    rows = await engine.query("SELECT ecosystem, name FROM packages ORDER BY ecosystem")
    assert [(r["ecosystem"], r["name"]) for r in rows] == [
        ("cargo", "serde"), ("npm", "left-pad"), ("pypi", "requests"),
    ]


async def test_package_versions_view_spans_every_registry(engine):
    when = "2026-10-21T11:39:00"
    await engine.ingest("npm_versions", [{"name": "axios", "version": "1.14.1", "published_at": when}])
    await engine.ingest("pypi_versions", [{"name": "litellm", "version": "1.107.0", "published_at": when}])
    await engine.ingest("registry_versions", [
        {"ecosystem": "composer", "name": "vendor/pkg", "version": "2.0.0", "published_at": when},
    ])
    rows = await engine.query("SELECT ecosystem, name, version FROM package_versions ORDER BY ecosystem")
    assert [(r["ecosystem"], r["name"], r["version"]) for r in rows] == [
        ("composer", "vendor/pkg", "2.0.0"), ("npm", "axios", "1.14.1"), ("pypi", "litellm", "1.107.0"),
    ]


async def test_views_pass_the_query_validator(engine):
    assert await engine.query("SELECT COUNT(*) AS n FROM packages") == [{"n": 0}]
    assert await engine.query("SELECT COUNT(*) AS n FROM package_versions") == [{"n": 0}]
