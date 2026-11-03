"""Lockfile readers for every supported format, and how their rows are stored."""

from __future__ import annotations

import json
import textwrap

import duckdb

from packages.core.coral.engine import CoralEngine
from packages.core.queries.templates import QueryLibrary
from packages.core.sources.ingestion import IngestorService
from packages.core.sources.lockfile import LockfileSource, has_supported_lockfile


def _write(folder, name, text):
    (folder / name).write_text(textwrap.dedent(text).lstrip("\n"), encoding="utf-8", newline="\n")


def _parse(folder):
    return LockfileSource().detect_and_parse(str(folder))


def _versions(records, eco=None):
    return sorted((r["package"], r["version"], r["declared_in"]) for r in records if eco in (None, r["ecosystem"]))


def test_requirements_read_only_exact_pins(tmp_path):
    _write(tmp_path, "requirements.txt", """
        # production
        requests==2.32.3  # http
        Flask[async]==3.0.0 ; python_version >= "3.9"
        numpy==1.26.*
        pandas>=2.0
        -r other.txt
        --index-url https://example.invalid/simple
        django==5.0.1 \\
            --hash=sha256:aaa
        """)
    _write(tmp_path, "requirements-dev.txt", "pytest==8.0.0\n")
    records = _parse(tmp_path)
    assert _versions(records) == [
        ("django", "5.0.1", "direct"), ("flask", "3.0.0", "direct"),
        ("pytest", "8.0.0", "direct"), ("requests", "2.32.3", "direct"),
    ]
    assert {r["ecosystem"] for r in records} == {"pypi"}


def test_uv_lock_skips_the_project_itself_and_marks_direct_dependencies(tmp_path):
    _write(tmp_path, "uv.lock", """
        version = 1

        [[package]]
        name = "certifi"
        version = "2024.8.30"
        source = { registry = "https://pypi.org/simple" }
        sdist = { url = "https://files/certifi.tar.gz", hash = "sha256:abc", size = 1 }

        [[package]]
        name = "my-app"
        version = "0.1.0"
        source = { virtual = "." }
        dependencies = [{ name = "requests" }]

        [package.dev-dependencies]
        dev = [{ name = "pytest" }]

        [[package]]
        name = "requests"
        version = "2.32.3"
        source = { registry = "https://pypi.org/simple" }
        dependencies = [{ name = "certifi" }]

        [[package]]
        name = "pytest"
        version = "8.0.0"
        source = { registry = "https://pypi.org/simple" }

        [[package]]
        name = "from-git"
        version = "1.0.0"
        source = { git = "https://github.com/x/y" }
        """)
    assert _versions(_parse(tmp_path)) == [
        ("certifi", "2024.8.30", "transitive"), ("pytest", "8.0.0", "direct"), ("requests", "2.32.3", "direct"),
    ]


def test_pipfile_lock_marks_direct_from_the_pipfile(tmp_path):
    _write(tmp_path, "Pipfile", '[packages]\nRequests = "*"\n\n[dev-packages]\npytest = "*"\n')
    (tmp_path / "Pipfile.lock").write_text(json.dumps({
        "default": {"requests": {"version": "==2.32.3", "hashes": ["sha256:aaa"]},
                    "urllib3": {"version": "==2.2.0"}, "mine": {"git": "https://github.com/x/mine"}},
        "develop": {"pytest": {"version": "==8.0.0"}},
    }), encoding="utf-8")
    assert _versions(_parse(tmp_path)) == [
        ("pytest", "8.0.0", "direct"), ("requests", "2.32.3", "direct"), ("urllib3", "2.2.0", "transitive"),
    ]


def test_composer_lock_reads_both_sections(tmp_path):
    (tmp_path / "composer.json").write_text(json.dumps({"require": {"Symfony/Console": "^7"}}), encoding="utf-8")
    (tmp_path / "composer.lock").write_text(json.dumps({
        "packages": [{"name": "symfony/console", "version": "v7.1.0", "dist": {"url": "https://x/console.zip"}},
                     {"name": "psr/log", "version": "3.0.0"}],
        "packages-dev": [{"name": "phpunit/phpunit", "version": "11.0.0"}],
    }), encoding="utf-8")
    records = _parse(tmp_path)
    assert _versions(records) == [
        ("phpunit/phpunit", "11.0.0", "transitive"), ("psr/log", "3.0.0", "transitive"),
        ("symfony/console", "v7.1.0", "direct"),
    ]
    assert {r["ecosystem"] for r in records} == {"composer"}


def test_gemfile_lock_strips_platform_suffixes(tmp_path):
    _write(tmp_path, "Gemfile.lock", """
        GEM
          remote: https://rubygems.org/
          specs:
            nokogiri (1.15.4-x86_64-linux)
              racc (~> 1.4)
            racc (1.7.1)
            rails (7.0.8)

        PLATFORMS
          x86_64-linux

        DEPENDENCIES
          rails (~> 7.0)

        BUNDLED WITH
           2.4.10
        """)
    assert _versions(_parse(tmp_path)) == [
        ("nokogiri", "1.15.4", "transitive"), ("racc", "1.7.1", "transitive"), ("rails", "7.0.8", "direct"),
    ]


def test_yarn_classic_keeps_scoped_names_and_resolved_urls(tmp_path):
    _write(tmp_path, "yarn.lock", """
        # yarn lockfile v1


        "@babel/core@^7.0.0", "@babel/core@^7.1.0":
          version "7.23.0"
          resolved "https://registry.yarnpkg.com/@babel/core/-/core-7.23.0.tgz#abc"
          integrity sha512-xyz
          dependencies:
            version-compare "^1.0.0"

        left-pad@^1.3.0:
          version "1.3.0"
          resolved "https://registry.yarnpkg.com/version-pad/-/left-pad-1.3.0.tgz"
        """)
    _write(tmp_path, "package.json", '{"dependencies": {"left-pad": "^1.3.0"}}')
    records = _parse(tmp_path)
    assert _versions(records) == [("@babel/core", "7.23.0", "transitive"), ("left-pad", "1.3.0", "direct")]
    pad = next(r for r in records if r["package"] == "left-pad")
    assert pad["resolved_url"].endswith("left-pad-1.3.0.tgz")  # a URL containing "version" is still read


def test_yarn_berry_reads_versions_and_skips_workspaces(tmp_path):
    _write(tmp_path, "yarn.lock", """
        __metadata:
          version: 8
          cacheKey: 10c0

        "lodash@npm:^4.17.21":
          version: 4.17.21
          resolution: "lodash@npm:4.17.21"
          checksum: 10c0/abc
          languageName: node
          linkType: hard

        "my-app@workspace:.":
          version: 0.0.0-use.local
          resolution: "my-app@workspace:."
          linkType: soft
        """)
    records = _parse(tmp_path)
    assert _versions(records) == [("lodash", "4.17.21", "transitive")]
    assert records[0]["integrity_hash"] == "10c0/abc"


def test_pnpm_lock_marks_direct_from_package_json(tmp_path):
    _write(tmp_path, "pnpm-lock.yaml", """
        lockfileVersion: '9.0'
        packages:
          lodash@4.17.21:
            resolution: {integrity: sha512-xyz}
          '@babel/core@7.23.0':
            resolution: {integrity: sha512-abc}
        """)
    _write(tmp_path, "package.json", '{"devDependencies": {"lodash": "^4"}}')
    assert _versions(_parse(tmp_path)) == [("@babel/core", "7.23.0", "transitive"), ("lodash", "4.17.21", "direct")]


def test_cargo_lock_keeps_only_registry_crates(tmp_path):
    _write(tmp_path, "Cargo.lock", """
        version = 3

        [[package]]
        name = "my-crate"
        version = "0.1.0"

        [[package]]
        name = "serde"
        version = "1.0.200"
        source = "registry+https://github.com/rust-lang/crates.io-index"
        checksum = "abc"

        [[package]]
        name = "from-git"
        version = "0.2.0"
        source = "git+https://github.com/x/y"
        """)
    assert _versions(_parse(tmp_path)) == [("serde", "1.0.200", "transitive")]


def test_go_sum_does_not_trim_versions_that_end_in_a_trimmed_letter(tmp_path):
    _write(tmp_path, "go.sum", """
        github.com/a/b v1.2.0 h1:abc=
        github.com/a/b v1.2.0/go.mod h1:def=
        github.com/c/d v0.0.0-20210101000000-abcdefabcd12 h1:ghi=
        github.com/e/f v0.0.0-20210101000000-0123456789ad h1:jkl=
        """)
    assert _versions(_parse(tmp_path)) == [
        ("github.com/a/b", "v1.2.0", "transitive"),
        ("github.com/c/d", "v0.0.0-20210101000000-abcdefabcd12", "transitive"),
        ("github.com/e/f", "v0.0.0-20210101000000-0123456789ad", "transitive"),
    ]


def test_every_version_of_a_package_is_kept_and_pypi_names_are_normalised(tmp_path):
    (tmp_path / "package-lock.json").write_text(json.dumps({"lockfileVersion": 3, "packages": {
        "": {"name": "app"},
        "node_modules/axios": {"version": "1.14.0"},
        "node_modules/lib/node_modules/axios": {"version": "1.14.1"},
        "node_modules/lib/node_modules/twin": {"version": "1.0.0"},
        "node_modules/twin": {"version": "1.0.0"},
        "node_modules/linked": {"link": True, "resolved": "../linked"},
    }}), encoding="utf-8")
    _write(tmp_path, "requirements.txt", "Foo_Bar==1.0\nfoo.bar==1.0\n")
    records = _parse(tmp_path)
    assert _versions(records, "npm") == [
        ("axios", "1.14.0", "direct"), ("axios", "1.14.1", "transitive"), ("twin", "1.0.0", "direct"),
    ]
    assert _versions(records, "pypi") == [("foo-bar", "1.0", "direct")]


def test_has_supported_lockfile(tmp_path):
    assert not has_supported_lockfile(tmp_path)
    _write(tmp_path, "requirements-prod.txt", "x==1\n")
    assert has_supported_lockfile(tmp_path)


async def test_two_versions_of_one_package_are_both_stored_and_the_bad_one_is_found(engine, tmp_path):
    (tmp_path / "package-lock.json").write_text(json.dumps({"lockfileVersion": 3, "packages": {
        "": {}, "node_modules/axios": {"version": "1.14.0"},
        "node_modules/lib/node_modules/axios": {"version": "1.14.1"},
    }}), encoding="utf-8")
    service = IngestorService()
    await service.ingest_lockfile(str(tmp_path), engine)
    stored = await engine.query("SELECT version FROM local_lockfiles WHERE package = 'axios' ORDER BY 1")
    assert [r["version"] for r in stored] == ["1.14.0", "1.14.1"]
    await engine.ingest("ossf_malicious_packages", [
        {"ecosystem": "npm", "package": "axios", "version": "1.14.1", "classification": "malicious",
         "ioc_hashes": [], "first_reported": "2026-03-31T00:00:00", "sources": ["MAL-2026-2307"]},
    ])
    hits = await engine.query(QueryLibrary.get("MALICIOUS_PACKAGE_MATCH"))
    assert [(h["package"], h["version"]) for h in hits] == [("axios", "1.14.1")]


async def test_rescanning_replaces_the_project_so_a_removed_version_stops_matching(engine, tmp_path):
    lock = tmp_path / "package-lock.json"
    service = IngestorService()
    lock.write_text(json.dumps({"lockfileVersion": 3, "packages": {"": {}, "node_modules/axios": {"version": "1.14.1"}}}),
                    encoding="utf-8")
    await service.ingest_lockfile(str(tmp_path), engine)
    lock.write_text(json.dumps({"lockfileVersion": 3, "packages": {"": {}, "node_modules/axios": {"version": "1.14.0"}}}),
                    encoding="utf-8")
    await service.ingest_lockfile(str(tmp_path), engine)
    rows = await engine.query("SELECT version FROM local_lockfiles")
    assert [r["version"] for r in rows] == ["1.14.0"]


async def test_old_lockfile_table_is_rebuilt_with_versions_in_its_key(tmp_path):
    db = tmp_path / "old.duckdb"
    conn = duckdb.connect(str(db))
    conn.execute(
        "CREATE TABLE local_lockfiles (project_path TEXT, ecosystem TEXT, package TEXT, version TEXT, "
        "integrity_hash TEXT, resolved_url TEXT, declared_in TEXT, parent_chain TEXT[], "
        "PRIMARY KEY (project_path, ecosystem, package))"
    )
    conn.execute("INSERT INTO local_lockfiles VALUES ('/p', 'npm', 'axios', '1.14.0', '', '', 'direct', [])")
    conn.execute("INSERT INTO local_lockfiles VALUES ('/p', 'npm', 'left-pad', NULL, '', '', 'direct', [])")
    conn.close()
    eng = CoralEngine(db_path=str(db), snapshot_dir=str(tmp_path / "snaps"))
    try:
        await eng.initialize_schema()
        rows = await eng.query("SELECT package, version FROM local_lockfiles ORDER BY package")
        assert [(r["package"], r["version"]) for r in rows] == [("axios", "1.14.0"), ("left-pad", "")]
        row = {"project_path": "/p", "ecosystem": "npm", "package": "axios", "version": "1.14.1",
               "integrity_hash": "", "resolved_url": "", "declared_in": "transitive", "parent_chain": []}
        assert await eng.ingest("local_lockfiles", [row]) == 1
        assert (await eng.query("SELECT COUNT(*) AS n FROM local_lockfiles WHERE package = 'axios'"))[0]["n"] == 2
    finally:
        eng._conn.close()
