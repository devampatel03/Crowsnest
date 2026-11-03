"""Shared fixtures. Every fixture uses temp paths: never the repo's crowsnest.duckdb."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))


@pytest.fixture(scope="session")
def seeded_db_template(tmp_path_factory):
    """Run the real seed once (about 25 s) and reuse the file for every API test."""
    import asyncio

    from packages.core.coral.engine import CoralEngine
    from packages.core.db.seed import seed_database

    d = tmp_path_factory.mktemp("seed-template")

    async def build():
        eng = CoralEngine(db_path=str(d / "template.duckdb"), snapshot_dir=str(d / "snaps"))
        await eng.initialize_schema()
        await seed_database(eng)
        eng._conn.close()

    asyncio.run(build())
    return d / "template.duckdb"


@pytest.fixture
def api_client(tmp_path, monkeypatch, seeded_db_template):
    """FastAPI TestClient wired to a throwaway DuckDB file, no API keys, demo mode off.

    The lifespan runs (schema + seed) in-process; no port is bound.
    """
    import shutil
    from unittest.mock import AsyncMock

    from fastapi.testclient import TestClient

    from packages.core import api
    from packages.core.config import get_settings

    shutil.copy(seeded_db_template, tmp_path / "api.duckdb")
    # DB is already seeded from the template; skip the slow lifespan re-seed.
    monkeypatch.setattr("packages.core.db.seed.seed_database", AsyncMock())
    monkeypatch.setenv("CROWSNEST_DB_PATH", str(tmp_path / "api.duckdb"))
    monkeypatch.setenv("CROWSNEST_SNAPSHOT_DIR", str(tmp_path / "snaps"))
    monkeypatch.setenv("ANTHROPIC_API_KEY", "")
    # A real key for any provider in the developer's .env must never reach a test.
    monkeypatch.setattr(api, "get_llm", lambda *a, **k: None)
    monkeypatch.setattr(api, "describe_llm", lambda *a, **k: {"configured": False})
    monkeypatch.setenv("DEMO_MODE", "false")
    # Tests never reach a real registry or the malware feed.
    monkeypatch.setenv("CROWSNEST_LIVE_LOOKUPS", "false")
    get_settings.cache_clear()

    api._incident_store.clear()
    api._scan_store.clear()
    api._reputation_cache = []
    api._reputation_cache_ts = 0.0
    while not api._event_queue.empty():
        api._event_queue.get_nowait()

    with TestClient(api.app) as client:
        yield client

    api._incident_store.clear()
    api._scan_store.clear()
    get_settings.cache_clear()


@pytest.fixture
async def engine(tmp_path):
    from packages.core.coral.engine import CoralEngine

    eng = CoralEngine(db_path=str(tmp_path / "e.duckdb"), snapshot_dir=str(tmp_path / "snaps"))
    await eng.initialize_schema()
    yield eng
    conn = getattr(eng, "_conn", None)
    if conn is not None:
        conn.close()
