"""
Regression tests for the CoralEngine SQL write-block-list bypass.

Background: `CoralEngine._validate_sql` used to tokenize SQL with a naive
`.split()` on whitespace and check for *exact* token equality against a
forbidden-keyword set. That meant a semicolon-chained multi-statement query
like ``"SELECT 1;DROP TABLE crowsnest_incidents"`` was never caught, because
`.split()` produced the single glued token ``"1;DROP"`` which never exactly
equals ``"DROP"``. DuckDB happily executes semicolon-separated multi-statement
strings, so this was a real live SQL-injection-style bypass for agent-issued
"read-only" queries.

These tests assert that `CoralEngine.query()` now rejects such payloads
(and several bypass variants) while still allowing legitimate single-
statement SELECT/JOIN queries through.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

# Ensure `packages` is importable when running via `pytest packages/core/tests/...`
# without the package being pip-installed in editable mode.
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from packages.core.coral.engine import CoralEngine  # noqa: E402


@pytest.fixture
async def engine(tmp_path):
    """A fresh, initialized CoralEngine backed by a throwaway on-disk DuckDB file."""
    db_path = str(tmp_path / "test_crowsnest.duckdb")
    eng = CoralEngine(db_path=db_path, snapshot_dir=str(tmp_path / "snapshots"))
    await eng.initialize_schema()
    yield eng


BYPASS_PAYLOADS = [
    # Original reported bypass: no space before the keyword, glued via semicolon.
    "SELECT 1;DROP TABLE crowsnest_incidents",
    # Mixed case keyword, still glued via semicolon.
    "SELECT 1;dRoP TABLE crowsnest_incidents",
    # Tab character instead of a space between the semicolon and keyword.
    "SELECT 1;\tDROP TABLE crowsnest_incidents",
    # Trailing semicolon followed by a second statement with its own trailing semicolon.
    "SELECT 1; DROP TABLE crowsnest_incidents;",
    # Multi-statement chain with an INSERT instead of DROP.
    "SELECT 1;INSERT INTO crowsnest_incidents (id, data) VALUES ('x', 'y')",
    # Keyword glued to punctuation without a semicolon at all (defense-in-depth
    # regex-word-boundary check, not just the semicolon ban).
    "SELECT 1,DROP(x) FROM crowsnest_incidents",
    # Newline-separated chained statement.
    "SELECT 1;\nDROP TABLE crowsnest_incidents",
]


@pytest.mark.asyncio
@pytest.mark.parametrize("payload", BYPASS_PAYLOADS)
async def test_multi_statement_bypass_rejected(engine, payload):
    """Every known bypass variant must be rejected, not executed."""
    with pytest.raises(ValueError):
        await engine.query(payload)

    # Extra safety: prove the table was NOT actually dropped/mutated.
    rows = await engine.query(
        "SELECT table_name FROM information_schema.tables "
        "WHERE table_name = 'crowsnest_incidents'"
    )
    assert rows, "crowsnest_incidents table must still exist after a rejected bypass attempt"


@pytest.mark.asyncio
async def test_direct_forbidden_keyword_rejected(engine):
    """A single-statement query containing a forbidden keyword is still rejected."""
    with pytest.raises(ValueError):
        await engine.query("DROP TABLE crowsnest_incidents")


@pytest.mark.asyncio
async def test_normal_select_with_join_passes(engine):
    """A legitimate, single-statement SELECT with a JOIN must still work."""
    rows = await engine.query(
        """
        SELECT l.package, l.version, n.weekly_downloads
        FROM local_lockfiles l
        JOIN npm_packages n ON n.name = l.package
        WHERE l.ecosystem = 'npm'
        LIMIT 10
        """
    )
    assert rows == []  # empty tables, but the query executed without being rejected


@pytest.mark.asyncio
async def test_harmless_trailing_semicolon_still_allowed(engine):
    """A single trailing semicolon (the common, harmless SQL terminator) is fine."""
    rows = await engine.query("SELECT 1 AS n;")
    assert rows == [{"n": 1}]


@pytest.mark.asyncio
async def test_string_literal_containing_semicolon_is_allowed(engine):
    """A semicolon *inside* a quoted string literal must not trigger the ban."""
    rows = await engine.query("SELECT 'a;b' AS s")
    assert rows == [{"s": "a;b"}]
