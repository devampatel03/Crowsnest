"""
CoralDB — DuckDB-powered cross-source SQL federation engine.

All external data sources are materialized as DuckDB tables. Agents query them
with plain SQL JOINs across sources that would normally require dozens of API calls.
"""

from __future__ import annotations

import asyncio
import json
import os
import threading
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Any

import duckdb
import structlog

log = structlog.get_logger(__name__)

# DuckDB concurrency: We use a single shared connection and serialize access via asyncio.Lock.
# This prevents deadlocks since DuckDB allows only one read/write connection to a file.

# SQL validation: only SELECT statements allowed from agents
_FORBIDDEN_KEYWORDS = {
    "INSERT", "UPDATE", "DELETE", "DROP", "CREATE", "ALTER",
    "TRUNCATE", "REPLACE", "MERGE", "EXEC", "EXECUTE",
}


class CoralEngine:
    """
    Crowsnest's data federation engine.

    Exposes all supply-chain data sources as a single DuckDB database.
    Cross-source JOINs are first-class — no API glue required by callers.
    """

    def __init__(self, db_path: str = ":memory:", snapshot_dir: str = "./snapshots"):
        self.db_path = db_path
        self.snapshot_dir = Path(snapshot_dir)
        self.snapshot_dir.mkdir(parents=True, exist_ok=True)
        # Serialise writes and database initialisation/schema changes
        self._write_lock = asyncio.Lock()
        # Initialise schema on first use
        self._initialized = False

    def _get_connection(self) -> duckdb.DuckDBPyConnection:
        """Return the shared read-write DuckDB connection (creates one if needed)."""
        if not hasattr(self, "_conn") or self._conn is None:
            self._conn = duckdb.connect(database=self.db_path, read_only=False)
        return self._conn

    def _sync_initialize_schema(self) -> None:
        conn = self._get_connection()
        conn.executemany("", [])  # no-op touch to ensure open
        conn.execute(_SCHEMA_DDL)
        self._initialized = True
        log.info("coral.schema_initialized", db_path=self.db_path)

    async def initialize_schema(self) -> None:
        """Create all tables (idempotent — uses IF NOT EXISTS)."""
        async with self._write_lock:
            if not self._initialized:
                await asyncio.get_event_loop().run_in_executor(
                    None, self._sync_initialize_schema
                )

    def _validate_sql(self, sql: str) -> None:
        """Reject any SQL that isn't a pure SELECT."""
        # Strip comments
        lines = []
        for line in sql.splitlines():
            line_content = line.strip()
            if line_content.startswith("--"):
                continue
            # Strip inline -- comments
            if "--" in line_content:
                # Be careful not to split inside strings, but simple split works for these templates
                line_content = line_content.split("--")[0].strip()
            if line_content:
                lines.append(line_content)
        cleaned_sql = "\n".join(lines)
        
        # Strip block comments /* ... */
        import re
        cleaned_sql = re.sub(r'/\*.*?\*/', '', cleaned_sql, flags=re.DOTALL)
        
        upper = cleaned_sql.upper().split()
        first_token = next((t for t in upper if t.strip()), "")
        if first_token not in ("SELECT", "WITH", "EXPLAIN"):
            raise ValueError(f"Only SELECT queries are allowed; got: {first_token!r}")
        for kw in _FORBIDDEN_KEYWORDS:
            if kw in upper:
                raise ValueError(f"Forbidden keyword in query: {kw}")

    def _sync_query(self, sql: str, params: dict[str, Any]) -> list[dict[str, Any]]:
        self._validate_sql(sql)
        prepared = _replace_named_params(sql, params)
        try:
            with self._get_connection().cursor() as conn:
                rel = conn.execute(prepared)
                columns = [desc[0] for desc in rel.description]
                rows = rel.fetchall()
                return [dict(zip(columns, row)) for row in rows]
        except duckdb.Error as exc:
            log.error("coral.query_error", error=str(exc), sql=sql[:200])
            return []

    async def query(self, sql: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        """Execute a read-only SQL query. Uses a thread-local cursor for concurrent safety."""
        if not self._initialized:
            async with self._write_lock:
                if not self._initialized:
                    await asyncio.get_event_loop().run_in_executor(None, self._sync_initialize_schema)
        return await asyncio.get_event_loop().run_in_executor(
            None, self._sync_query, sql, params or {}
        )

    def _sync_ingest(self, table: str, records: list[dict[str, Any]]) -> int:
        if not records:
            return 0
        cols = list(records[0].keys())
        placeholders = ", ".join(["?" for _ in cols])
        col_list = ", ".join(cols)
        # Build the ON CONFLICT update clause (update all non-key columns)
        update_clause = ", ".join(f"{c} = excluded.{c}" for c in cols)
        sql = (
            f"INSERT INTO {table} ({col_list}) VALUES ({placeholders}) "
            f"ON CONFLICT DO UPDATE SET {update_clause}"
        )
        values = [[_coerce(r.get(c)) for c in cols] for r in records]
        try:
            with self._get_connection().cursor() as conn:
                conn.executemany(sql, values)
                log.info("coral.ingest", table=table, count=len(records))
                return len(records)
        except duckdb.Error as exc:
            log.error("coral.ingest_error", table=table, error=str(exc))
            # Try row-by-row to isolate bad records
            inserted = 0
            with self._get_connection().cursor() as conn:
                for row_vals in values:
                    try:
                        conn.execute(sql, row_vals)
                        inserted += 1
                    except duckdb.Error:
                        pass
            return inserted

    async def ingest(self, table: str, records: list[dict[str, Any]]) -> int:
        """Upsert records into a Coral table. Returns count inserted."""
        async with self._write_lock:
            if not self._initialized:
                await asyncio.get_event_loop().run_in_executor(None, self._sync_initialize_schema)
            return await asyncio.get_event_loop().run_in_executor(
                None, self._sync_ingest, table, records
            )

    def _sync_execute(self, sql: str, params: dict[str, Any]) -> None:
        """Execute a write SQL statement (INSERT, DELETE, UPDATE, etc.) without SELECT validation."""
        prepared = _replace_named_params(sql, params)
        try:
            with self._get_connection().cursor() as conn:
                conn.execute(prepared)
        except duckdb.Error as exc:
            log.error("coral.execute_error", error=str(exc), sql=sql[:200])
            raise

    async def execute(self, sql: str, params: dict[str, Any] | None = None) -> None:
        """Execute a write SQL statement. Does NOT enforce SELECT-only restriction."""
        async with self._write_lock:
            if not self._initialized:
                await asyncio.get_event_loop().run_in_executor(None, self._sync_initialize_schema)
            await asyncio.get_event_loop().run_in_executor(
                None, self._sync_execute, sql, params or {}
            )

    def _sync_snapshot(self, name: str) -> str:
        conn = self._get_connection()
        path = self.snapshot_dir / name
        path.mkdir(parents=True, exist_ok=True)
        conn.execute(f"EXPORT DATABASE '{path}' (FORMAT PARQUET, COMPRESSION ZSTD)")
        meta_path = path / "snapshot_meta.json"
        meta_path.write_text(json.dumps({
            "name": name,
            "created_at": datetime.utcnow().isoformat(),
            "db_path": self.db_path,
        }))
        log.info("coral.snapshot_created", name=name, path=str(path))
        return str(path)

    async def snapshot(self, name: str | None = None) -> str:
        """Save a named snapshot of all tables as Parquet files (for Time Machine)."""
        if not self._initialized:
            await self.initialize_schema()
        snap_name = name or datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        return await asyncio.get_event_loop().run_in_executor(
            None, self._sync_snapshot, snap_name
        )

    def _sync_restore_snapshot(self, name: str) -> None:
        path = self.snapshot_dir / name
        if not path.exists():
            raise FileNotFoundError(f"Snapshot not found: {name}")
        conn = self._get_connection()
        conn.execute(f"IMPORT DATABASE '{path}'")
        log.info("coral.snapshot_restored", name=name)

    async def restore_snapshot(self, name: str) -> None:
        """Load a historical snapshot (for Incident Replay / Time Machine queries)."""
        await asyncio.get_event_loop().run_in_executor(
            None, self._sync_restore_snapshot, name
        )

    def list_snapshots(self) -> list[dict[str, Any]]:
        """List available snapshots with metadata."""
        snaps = []
        for p in sorted(self.snapshot_dir.iterdir()):
            if p.is_dir():
                meta_file = p / "snapshot_meta.json"
                if meta_file.exists():
                    snaps.append(json.loads(meta_file.read_text()))
                else:
                    snaps.append({"name": p.name, "created_at": None})
        return snaps

    async def table_stats(self) -> dict[str, int]:
        """Return row counts per table for observability."""
        tables = [row["table_name"] for row in await self.query(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main'"
        )]
        counts = {}
        for t in tables:
            rows = await self.query(f"SELECT COUNT(*) AS n FROM {t}")
            counts[t] = rows[0]["n"] if rows else 0
        return counts


def _replace_named_params(sql: str, params: dict[str, Any]) -> str:
    """Replace :name placeholders with literal values (safe for DuckDB)."""
    # Sort by length descending so :pkg_10 is replaced before :pkg_1
    for key in sorted(params.keys(), key=len, reverse=True):
        val = params[key]
        placeholder = f":{key}"
        if placeholder in sql:
            if isinstance(val, str):
                escaped = val.replace("'", "''")
                sql = sql.replace(placeholder, f"'{escaped}'")
            elif val is None:
                sql = sql.replace(placeholder, "NULL")
            else:
                sql = sql.replace(placeholder, str(val))
    return sql


def _coerce(val: Any) -> Any:
    """Coerce Python values to DuckDB-friendly types."""
    if isinstance(val, (list, dict)):
        return json.dumps(val)
    if isinstance(val, datetime):
        return val.isoformat()
    return val


_SCHEMA_DDL = """
-- ─────────────────────────────────────────────
-- CODE & IDENTITY
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gh_repos (
    org TEXT,
    repo_name TEXT,
    default_branch TEXT,
    visibility TEXT,
    created_at TIMESTAMP,
    archived BOOLEAN,
    PRIMARY KEY (org, repo_name)
);

CREATE TABLE IF NOT EXISTS gh_commits (
    repo TEXT,
    sha TEXT PRIMARY KEY,
    author_email TEXT,
    author_login TEXT,
    committer_login TEXT,
    ts TIMESTAMP,
    files_changed TEXT[],
    gpg_verified BOOLEAN,
    signed_by TEXT,
    is_merge BOOLEAN,
    parent_count INTEGER,
    message TEXT
);

CREATE TABLE IF NOT EXISTS gh_releases (
    repo TEXT,
    tag TEXT,
    release_ts TIMESTAMP,
    author_login TEXT,
    attestation_url TEXT,
    asset_urls TEXT[],
    PRIMARY KEY (repo, tag)
);

CREATE TABLE IF NOT EXISTS gh_actions_runs (
    repo TEXT,
    workflow TEXT,
    run_id TEXT PRIMARY KEY,
    started_at TIMESTAMP,
    finished_at TIMESTAMP,
    conclusion TEXT,
    runner_label TEXT,
    triggered_by TEXT,
    oidc_audience TEXT,
    oidc_subject TEXT
);

CREATE TABLE IF NOT EXISTS gh_workflow_files (
    repo TEXT,
    path TEXT,
    ref TEXT,
    content_hash TEXT,
    declared_actions TEXT[],
    permissions TEXT,
    has_pwn_request_pattern BOOLEAN,
    PRIMARY KEY (repo, path, ref)
);

CREATE TABLE IF NOT EXISTS gh_repo_perms_audit (
    id TEXT PRIMARY KEY,
    repo TEXT,
    ts TIMESTAMP,
    actor TEXT,
    change_type TEXT,
    target_user TEXT,
    before_role TEXT,
    after_role TEXT
);

CREATE TABLE IF NOT EXISTS local_lockfiles (
    project_path TEXT,
    ecosystem TEXT,
    package TEXT,
    version TEXT,
    integrity_hash TEXT,
    resolved_url TEXT,
    declared_in TEXT,
    parent_chain TEXT[],
    PRIMARY KEY (project_path, ecosystem, package)
);

CREATE TABLE IF NOT EXISTS local_source_packages_mentioned (
    file_path TEXT,
    ecosystem TEXT,
    package TEXT,
    ref_type TEXT,
    line_no INTEGER,
    first_seen_commit TEXT,
    ai_authored_likelihood FLOAT,
    PRIMARY KEY (file_path, package)
);

CREATE TABLE IF NOT EXISTS sigstore_rekor (
    log_index BIGINT PRIMARY KEY,
    integrated_time TIMESTAMP,
    subject TEXT,
    public_key TEXT,
    x509_chain TEXT,
    build_config_uri TEXT,
    build_invocation_id TEXT,
    attested_predicate JSON
);

-- ─────────────────────────────────────────────
-- REGISTRY / ARTIFACT
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS npm_packages (
    name TEXT PRIMARY KEY,
    latest_version TEXT,
    total_versions INTEGER,
    weekly_downloads BIGINT,
    repo_url TEXT,
    license TEXT,
    maintainers TEXT[],
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    has_install_script BOOLEAN,
    unpacked_size BIGINT,
    dist_tags JSON
);

CREATE TABLE IF NOT EXISTS npm_versions (
    name TEXT,
    version TEXT,
    published_at TIMESTAMP,
    published_by TEXT,
    tarball_url TEXT,
    shasum TEXT,
    integrity TEXT,
    dependencies JSON,
    dev_dependencies JSON,
    has_install_script BOOLEAN,
    has_postinstall BOOLEAN,
    has_prepare BOOLEAN,
    attestation_subject_uri TEXT,
    attestation_predicate_type TEXT,
    PRIMARY KEY (name, version)
);

CREATE TABLE IF NOT EXISTS npm_maintainers (
    package TEXT,
    maintainer_login TEXT,
    action TEXT,
    ts TIMESTAMP,
    performed_by TEXT
);

CREATE TABLE IF NOT EXISTS npm_publish_events (
    package TEXT,
    version TEXT,
    published_at TIMESTAMP,
    published_by TEXT,
    npm_org TEXT,
    publish_via TEXT,
    source_ip_country TEXT,
    PRIMARY KEY (package, version, published_at)
);

CREATE TABLE IF NOT EXISTS pypi_packages (
    name TEXT PRIMARY KEY,
    latest_version TEXT,
    weekly_downloads BIGINT,
    repo_url TEXT,
    license TEXT,
    maintainers TEXT[],
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pypi_versions (
    name TEXT,
    version TEXT,
    published_at TIMESTAMP,
    published_by TEXT,
    requires_python TEXT,
    PRIMARY KEY (name, version)
);

-- ─────────────────────────────────────────────
-- THREAT INTEL
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS osv_advisories (
    osv_id TEXT PRIMARY KEY,
    summary TEXT,
    details TEXT,
    severity TEXT,
    published TIMESTAMP,
    modified TIMESTAMP,
    affected_packages JSON,
    aliases TEXT[]
);

CREATE TABLE IF NOT EXISTS ghsa (
    ghsa_id TEXT PRIMARY KEY,
    severity TEXT,
    cvss_score FLOAT,
    affected_versions TEXT,
    fixed_in TEXT,
    published TIMESTAMP,
    cwe_ids TEXT[]
);

CREATE TABLE IF NOT EXISTS socket_alerts (
    package TEXT,
    ecosystem TEXT,
    version TEXT,
    alert_type TEXT,
    severity TEXT,
    description TEXT,
    first_seen TIMESTAMP,
    PRIMARY KEY (package, version, alert_type)
);

CREATE TABLE IF NOT EXISTS ossf_malicious_packages (
    ecosystem TEXT,
    package TEXT,
    version TEXT,
    classification TEXT,
    ioc_hashes TEXT[],
    first_reported TIMESTAMP,
    sources TEXT[],
    PRIMARY KEY (ecosystem, package, version)
);

CREATE TABLE IF NOT EXISTS shai_hulud_iocs (
    campaign_name TEXT,
    ioc_type TEXT,
    value TEXT,
    first_seen TIMESTAMP,
    attribution TEXT,
    attack_wave TEXT,
    PRIMARY KEY (campaign_name, ioc_type, value)
);

CREATE TABLE IF NOT EXISTS known_hallucination_patterns (
    package TEXT PRIMARY KEY,
    pattern_type TEXT,
    confidence FLOAT,
    source TEXT
);

-- ─────────────────────────────────────────────
-- RUNTIME (optional opt-in)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS runtime_imports (
    host TEXT,
    process TEXT,
    ecosystem TEXT,
    package TEXT,
    version TEXT,
    first_loaded_at TIMESTAMP,
    last_loaded_at TIMESTAMP,
    PRIMARY KEY (host, ecosystem, package)
);

-- ─────────────────────────────────────────────
-- INCIDENT PERSISTENCE
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crowsnest_incidents (
    id TEXT PRIMARY KEY,
    data TEXT  -- JSON-serialized AlertObject
);
"""
