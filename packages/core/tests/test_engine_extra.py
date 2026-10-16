"""Extra CoralEngine tests: SQL block-list bypass hunting, ingest, snapshots, stats.

Defects found are pinned with xfail(strict=True); when fixed, the XPASS fails the run so the
marker gets removed.
"""

from __future__ import annotations

import pytest

from packages.core.coral.engine import CoralEngine, _contains_unquoted_char, _replace_named_params


async def _table_exists(engine, name="crowsnest_incidents"):
    rows = await engine.query(
        "SELECT table_name FROM information_schema.tables WHERE table_name = :n", {"n": name}
    )
    return bool(rows)


REJECTED = [
    "SELECT 1; SELECT 2",
    "select 1 ;drop table crowsnest_incidents",
    "SELECT 1 /* c */ ; DROP TABLE crowsnest_incidents",
    "SELECT 1 -- c\n; DROP TABLE crowsnest_incidents",
    "  \n\t DROP TABLE crowsnest_incidents",
    "COPY crowsnest_incidents TO 'x.csv'",
    "ATTACH 'other.duckdb' AS o",
    "PRAGMA database_list",
    "INSTALL httpfs",
    "UPDATE crowsnest_incidents SET data = 'x'",
    "WITH t AS (SELECT 1) DELETE FROM crowsnest_incidents",
    "EXPLAIN DROP TABLE crowsnest_incidents",
    "SELECT 1 WHERE 1=1 UNION SELECT 2; TRUNCATE crowsnest_incidents",
    "",
    "   ",
    "-- only a comment",
    "/* only a block comment */",
]


@pytest.mark.asyncio
@pytest.mark.parametrize("sql", REJECTED)
async def test_rejected_and_table_survives(engine, sql):
    with pytest.raises(ValueError):
        await engine.query(sql)
    assert await _table_exists(engine)


@pytest.mark.asyncio
@pytest.mark.parametrize("sql", [
    "SELECT 1 AS n",
    "WITH t AS (SELECT 1 AS n) SELECT n FROM t",
    "SELECT 1 /* ; DROP */ AS n",
    "SELECT ';' AS s",
    "SELECT 'it''s; fine' AS s",
    "select 1 as n;  ",
])
async def test_legit_queries_allowed(engine, sql):
    assert await engine.query(sql)


@pytest.mark.asyncio
async def test_bypass_semicolon_after_dashes_inside_string_literal(engine):
    """A '--' inside a string literal makes _validate_sql truncate the line, hiding the
    `;DROP` from the semicolon and keyword checks, while the ORIGINAL sql is what DuckDB runs."""
    with pytest.raises(ValueError):
        await engine.query("SELECT '--'; DROP TABLE crowsnest_incidents")


@pytest.mark.asyncio
async def test_bypass_dashes_in_string_does_not_drop_table(engine):
    """Even if the query is not rejected, the table must not be dropped."""
    try:
        await engine.query("SELECT '--'; DROP TABLE crowsnest_incidents")
    except ValueError:
        pass
    assert await _table_exists(engine)


@pytest.mark.asyncio
async def test_file_read_functions_blocked(engine):
    """read_text, read_csv and glob must be blocked, or /api/query could read any local file."""
    with pytest.raises(ValueError):
        await engine.query("SELECT content FROM read_text('pyproject.toml')")


@pytest.mark.asyncio
async def test_keyword_inside_string_literal_is_allowed(engine):
    """A write keyword inside a string literal is data (e.g. a package named "update-notifier")."""
    assert await engine.query("SELECT 'create' AS s, 'drop table x' AS t") == [
        {"s": "create", "t": "drop table x"}
    ]


@pytest.mark.asyncio
@pytest.mark.parametrize("sql", [
    "SELECT * FROM glob('*')",
    "SELECT * FROM read_csv('C:/Windows/win.ini')",
    "SELECT * FROM 'C:/Windows/win.ini'",
    "SELECT * FROM \"read_text\"('pyproject.toml')",
    "SELECT getenv('PATH')",
    "SELECT * FROM crowsnest_incidents WHERE id IN (SELECT content FROM read_text('x'))",
    "SELECT * FROM parquet_scan('x.parquet')",
])
async def test_file_and_host_access_blocked_in_every_position(engine, sql):
    """File and environment access is rejected wherever it appears in the query."""
    with pytest.raises(ValueError):
        await engine.query(sql)


class TestHelpers:
    def test_contains_unquoted_char(self):
        assert _contains_unquoted_char("a;b", ";")
        assert not _contains_unquoted_char("'a;b'", ";")
        assert not _contains_unquoted_char("'it''s;'", ";")
        assert _contains_unquoted_char("'x';y", ";")
        assert not _contains_unquoted_char("", ";")

    def test_replace_named_params_escapes_quotes_and_types(self):
        out = _replace_named_params(
            "SELECT :s, :n, :f, :b, :z", {"s": "a'b", "n": 3, "f": 1.5, "b": True, "z": None}
        )
        assert out == "SELECT 'a''b', 3, 1.5, TRUE, NULL"

    def test_replace_named_params_longest_key_first(self):
        assert _replace_named_params("SELECT :p_1, :p_10", {"p_1": 1, "p_10": 10}) == "SELECT 1, 10"

    def test_unsupported_param_raises_typeerror(self):
        with pytest.raises(TypeError):
            _replace_named_params("SELECT :x", {"x": {"a": 1}})

    def test_unused_param_ignored(self):
        assert _replace_named_params("SELECT 1", {"x": object()}) == "SELECT 1"


@pytest.mark.asyncio
class TestIngestAndStats:
    async def test_ingest_empty_returns_zero(self, engine):
        assert await engine.ingest("npm_packages", []) == 0

    async def test_ingest_and_upsert(self, engine):
        rec = {"id": "i1", "data": "one"}
        assert await engine.ingest("crowsnest_incidents", [rec]) == 1
        await engine.ingest("crowsnest_incidents", [{"id": "i1", "data": "two"}])
        rows = await engine.query("SELECT data FROM crowsnest_incidents WHERE id = 'i1'")
        assert rows == [{"data": "two"}]

    async def test_ingest_bad_column_returns_zero_without_raising(self, engine):
        assert await engine.ingest("crowsnest_incidents", [{"nope": 1}]) == 0

    async def test_ingest_unknown_table_returns_zero(self, engine):
        assert await engine.ingest("no_such_table", [{"a": 1}]) == 0

    async def test_execute_allows_writes_and_raises_on_error(self, engine):
        await engine.execute("INSERT INTO crowsnest_incidents (id, data) VALUES (:i, :d)",
                             {"i": "a", "d": "b"})
        assert (await engine.query("SELECT COUNT(*) AS n FROM crowsnest_incidents"))[0]["n"] == 1
        with pytest.raises(Exception):
            await engine.execute("INSERT INTO nope VALUES (1)")

    async def test_query_runtime_error_returns_empty_list(self, engine):
        assert await engine.query("SELECT * FROM table_that_does_not_exist") == []

    async def test_table_stats_lists_all_tables(self, engine):
        stats = await engine.table_stats()
        assert stats["crowsnest_incidents"] == 0
        assert {"local_lockfiles", "npm_packages", "socket_alerts"} <= set(stats)

    async def test_concurrent_writes_and_reads_serialise(self, engine):
        import asyncio
        await asyncio.gather(*[
            engine.execute("INSERT INTO crowsnest_incidents (id, data) VALUES (:i, 'x')", {"i": f"id{n}"})
            for n in range(20)
        ])
        reads = await asyncio.gather(*[
            engine.query("SELECT COUNT(*) AS n FROM crowsnest_incidents") for _ in range(10)
        ])
        assert all(r[0]["n"] == 20 for r in reads)

    async def test_initialize_schema_is_idempotent(self, engine):
        await engine.initialize_schema()
        await engine.initialize_schema()
        assert await _table_exists(engine)


@pytest.mark.asyncio
class TestSnapshots:
    async def test_snapshot_roundtrip(self, engine):
        await engine.execute("INSERT INTO crowsnest_incidents (id, data) VALUES ('s', 'v')")
        path = await engine.snapshot("snap1")
        assert path.endswith("snap1")
        snaps = engine.list_snapshots()
        assert [s["name"] for s in snaps] == ["snap1"]
        assert snaps[0]["db_path"] == engine.db_path

    async def test_list_snapshots_empty(self, engine):
        assert engine.list_snapshots() == []

    async def test_restore_missing_snapshot_raises(self, engine):
        with pytest.raises(FileNotFoundError):
            await engine.restore_snapshot("ghost")

    async def test_restore_snapshot_name_path_traversal_not_possible_outside_dir(self, engine, tmp_path):
        """A snapshot name containing ../ must not escape snapshot_dir."""
        outside = tmp_path / "outside"
        outside.mkdir()
        with pytest.raises((FileNotFoundError, ValueError)):
            await engine.restore_snapshot("../outside")


def test_engine_creates_snapshot_dir(tmp_path):
    target = tmp_path / "a" / "b"
    CoralEngine(db_path=":memory:", snapshot_dir=str(target))
    assert target.is_dir()


def _lock_rows(n: int) -> list[dict]:
    return [
        {"project_path": "/p", "ecosystem": "npm", "package": f"pkg{i}", "version": "1.0.0",
         "integrity_hash": "x", "resolved_url": "u", "declared_in": "d", "parent_chain": ["a", "b'c"]}
        for i in range(n)
    ]


@pytest.mark.asyncio
async def test_ingest_is_fast_and_upserts(engine):
    import time

    rows = _lock_rows(2000)
    started = time.monotonic()
    assert await engine.ingest("local_lockfiles", rows) == 2000
    assert time.monotonic() - started < 10, "bulk ingest regressed to per-row speed"
    rows[5]["version"] = "2.0.0"
    rows.append(dict(rows[0]))  # duplicate primary key inside one batch
    await engine.ingest("local_lockfiles", rows)
    assert (await engine.query("SELECT COUNT(*) AS n FROM local_lockfiles"))[0]["n"] == 2000
    got = await engine.query("SELECT version, parent_chain FROM local_lockfiles WHERE package = 'pkg5'")
    assert got == [{"version": "2.0.0", "parent_chain": ["a", "b'c"]}]


@pytest.mark.asyncio
@pytest.mark.parametrize("table,col", [
    ("local_lockfiles; DROP TABLE local_lockfiles", "package"),
    ("local_lockfiles", "package) VALUES ('x'); --"),
])
async def test_ingest_rejects_unsafe_identifiers(engine, table, col):
    with pytest.raises(ValueError):
        await engine.ingest(table, [{col: "x"}])


@pytest.mark.asyncio
@pytest.mark.parametrize("sql", [
    "SELECT * FROM canary_probe.csv",           # replacement scan via schema-qualified name
    "SELECT * FROM main.canary_probe.csv",
    "SELECT * FROM x.y.z",                      # catalog-qualified
    "SELECT * FROM other_schema.crowsnest_incidents",
    "SELECT * FROM crowsnest_incidents a JOIN canary_probe.csv b ON TRUE",
    "WITH t AS (SELECT * FROM canary_probe.csv) SELECT * FROM t",
])
async def test_replacement_scan_via_qualified_name_blocked(engine, sql, tmp_path, monkeypatch):
    """`FROM name.csv` is a replacement scan that reads a file from the working directory, so it must be rejected."""
    monkeypatch.chdir(tmp_path)
    (tmp_path / "canary_probe.csv").write_text("a,b\n1,2\n")
    with pytest.raises(ValueError):
        await engine.query(sql)


@pytest.mark.asyncio
async def test_main_and_information_schema_still_allowed(engine):
    assert await engine.query("SELECT COUNT(*) AS n FROM main.crowsnest_incidents") == [{"n": 0}]
    assert await engine.query("SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = 'main'")
