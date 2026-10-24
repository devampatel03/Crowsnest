"""Schema tests: every table must accept and upsert a row, and old databases are migrated."""

from __future__ import annotations

import duckdb

from packages.core.coral.engine import CoralEngine

_SAMPLES = {
    "VARCHAR": "x",
    "TIMESTAMP": "2026-01-01T00:00:00",
    "BIGINT": 1,
    "INTEGER": 1,
    "FLOAT": 0.5,
    "BOOLEAN": True,
    "VARCHAR[]": ["a"],
    "JSON": "{}",
}


async def _columns(engine, table):
    return await engine.query(
        "SELECT column_name, data_type FROM information_schema.columns "
        "WHERE table_name = :t ORDER BY ordinal_position",
        {"t": table},
    )


async def _tables(engine):
    rows = await engine.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' ORDER BY 1"
    )
    return [r["table_name"] for r in rows]


async def test_every_table_round_trips_and_upserts(engine):
    """ingest() upserts with ON CONFLICT, which silently stores nothing in a table with no key."""
    broken = []
    for table in await _tables(engine):
        row = {c["column_name"]: _SAMPLES[c["data_type"]] for c in await _columns(engine, table)}
        first = await engine.ingest(table, [row])
        second = await engine.ingest(table, [row])
        count = (await engine.query(f"SELECT COUNT(*) AS n FROM {table}"))[0]["n"]
        if (first, second, count) != (1, 1, 1):
            broken.append((table, first, second, count))
    assert broken == []


async def test_npm_maintainers_keeps_every_maintainer_of_a_package(engine):
    rows = [
        {"package": "left-pad", "maintainer_login": "alice", "action": "add",
         "ts": "2020-01-01T00:00:00", "performed_by": "alice"},
        {"package": "left-pad", "maintainer_login": "mallory", "action": "add",
         "ts": "2026-10-01T00:00:00", "performed_by": "alice"},
        {"package": "right-pad", "maintainer_login": "alice", "action": "add",
         "ts": "2021-01-01T00:00:00", "performed_by": "alice"},
    ]
    assert await engine.ingest("npm_maintainers", rows) == 3
    found = await engine.query("SELECT maintainer_login FROM npm_maintainers WHERE package = 'left-pad'")
    assert {r["maintainer_login"] for r in found} == {"alice", "mallory"}


def _legacy_db(path, rows):
    """A database created before npm_maintainers had a primary key."""
    conn = duckdb.connect(str(path))
    conn.execute(
        "CREATE TABLE npm_maintainers (package TEXT, maintainer_login TEXT, action TEXT, "
        "ts TIMESTAMP, performed_by TEXT)"
    )
    conn.executemany("INSERT INTO npm_maintainers VALUES (?, ?, ?, ?, ?)", rows)
    conn.close()


async def test_old_database_is_migrated_and_keeps_earliest_row(tmp_path):
    db = tmp_path / "old.duckdb"
    _legacy_db(db, [
        ("pkg", "alice", "add", "2021-01-01", "alice"),
        ("pkg", "alice", "add", "2020-01-01", "bob"),
        ("pkg", "bob", "add", "2022-01-01", "alice"),
        (None, "ghost", "add", "2022-01-01", None),
    ])
    eng = CoralEngine(db_path=str(db), snapshot_dir=str(tmp_path / "snaps"))
    try:
        await eng.initialize_schema()
        rows = await eng.query(
            "SELECT maintainer_login, CAST(ts AS VARCHAR) AS ts FROM npm_maintainers ORDER BY 1"
        )
        assert [(r["maintainer_login"], r["ts"][:10]) for r in rows] == [
            ("alice", "2020-01-01"),
            ("bob", "2022-01-01"),
        ]
        assert await eng.ingest("npm_maintainers", [
            {"package": "pkg", "maintainer_login": "carol", "action": "add",
             "ts": "2026-01-01T00:00:00", "performed_by": "alice"},
        ]) == 1
    finally:
        eng._conn.close()


async def test_migration_is_a_no_op_on_a_current_database(tmp_path):
    db = tmp_path / "new.duckdb"
    eng = CoralEngine(db_path=str(db), snapshot_dir=str(tmp_path / "snaps"))
    try:
        await eng.initialize_schema()
        await eng.ingest("npm_maintainers", [
            {"package": "p", "maintainer_login": "a", "action": "add",
             "ts": "2024-01-01T00:00:00", "performed_by": "a"},
        ])
        eng._conn.close()
        eng2 = CoralEngine(db_path=str(db), snapshot_dir=str(tmp_path / "snaps"))
        await eng2.initialize_schema()
        eng = eng2
        assert (await eng2.query("SELECT COUNT(*) AS n FROM npm_maintainers"))[0]["n"] == 1
    finally:
        eng._conn.close()
