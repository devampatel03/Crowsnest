"""
Crowsnest FastAPI backend.

Exposes REST endpoints for the dashboard and CLI, plus an SSE stream for
real-time events (npm publish firehose, scan progress, incident alerts).
"""

from __future__ import annotations

import asyncio
import json
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import structlog
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from .agents.graph import run_scan
from .agents.state import AlertObject
from .checks import CheckError, check_changes
from .config import get_settings
from .coral.engine import CoralEngine
from .llm import LLMClient, get_llm
from .llm import describe as describe_llm
from .queries.templates import QueryLibrary
from .sources.lockfile import LOCKFILE_NAMES, has_supported_lockfile
from .veto import evaluate as evaluate_veto

log = structlog.get_logger(__name__)

_engine: CoralEngine | None = None
_event_queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=1000)
_scan_store: dict[str, dict[str, Any]] = {}   # scan_id -> status dict
_incident_store: list[AlertObject] = []        # persisted incidents
_reputation_cache: list[dict[str, Any]] = []   # cached maintainer scores
_reputation_cache_ts: float = 0.0              # timestamp of last cache fill


async def _demo_firehose_task() -> None:
    """Emit synthetic npm publish events for demo mode."""
    import random
    DEMO_PACKAGES = [
        ("lodash", "4.17.22", 0.05),
        ("express", "4.18.3", 0.08),
        ("axios", "1.6.8", 0.06),
        ("react", "18.2.1", 0.04),
        ("webpack", "5.91.0", 0.07),
        ("typescript", "5.4.5", 0.03),
        ("prettier", "3.2.5", 0.04),
        ("eslint", "8.57.0", 0.06),
        ("node-fetch", "3.3.2", 0.15),  # elevated
        ("colors", "1.4.1", 0.22),       # elevated
        ("event-stream", "4.0.1", 0.65), # high
        ("ua-parser-js", "1.0.38", 0.80), # very high
    ]
    while True:
        await asyncio.sleep(random.uniform(3.0, 8.0))
        pkg_name, version, prob = random.choice(DEMO_PACKAGES)
        await _push_event("publish_event", {
            "package": pkg_name,
            "version": version,
            "probability": prob,
            "registry": "npm",
        })


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    global _engine
    settings = get_settings()
    _engine = CoralEngine(
        db_path=settings.crowsnest_db_path,
        snapshot_dir=settings.crowsnest_snapshot_dir,
    )
    await _engine.initialize_schema()

    # Seed database with IOC and hallucination pattern data
    try:
        from .db.seed import seed_database
        await seed_database(_engine)
    except Exception as exc:
        log.warning("lifespan.seed_failed", error=str(exc))

    # Restore persisted incidents from DuckDB
    try:
        persisted = await _engine.query("SELECT id, data FROM crowsnest_incidents")
        for row in persisted:
            try:
                inc = json.loads(row["data"])
                _incident_store.append(inc)
            except Exception:
                pass
        if persisted:
            log.info("lifespan.incidents_restored", count=len(persisted))
    except Exception as exc:
        log.warning("lifespan.incidents_restore_failed", error=str(exc))

    # Start demo firehose if in demo mode
    if settings.crowsnest_demo_mode:
        asyncio.create_task(_demo_firehose_task())

    log.info("crowsnest.api_ready", db=settings.crowsnest_db_path)
    yield
    log.info("crowsnest.api_shutdown")


app = FastAPI(
    title="Crowsnest API",
    description="Supply chain forensics agent — see the storm before it hits your ship",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in get_settings().crowsnest_cors_origins.split(",") if o.strip()],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ScanRequest(BaseModel):
    project_path: str
    ecosystem: str = "npm"
    lockfile_path: str | None = None
    github_org: str | None = None


class InvestigateRequest(BaseModel):
    package: str
    version: str | None = None
    ecosystem: str = "npm"


class BlastRadiusRequest(BaseModel):
    maintainer: str
    ecosystem: str = "npm"


class ReplayRequest(BaseModel):
    ioc_name: str
    snapshot_date: str | None = None


class VetoRequest(BaseModel):
    package: str
    version: str | None = None
    ecosystem: str = "npm"
    # Days a version must have been public before it is allowed; None uses the server setting.
    min_release_age_days: float | None = Field(default=None, ge=0, le=365)


class CoralQueryRequest(BaseModel):
    sql: str
    params: dict[str, Any] = {}


def _get_engine() -> CoralEngine:
    if _engine is None:
        raise HTTPException(status_code=503, detail="Database not initialised")
    return _engine


async def _push_event(event_type: str, data: dict[str, Any]) -> None:
    event = {"type": event_type, "timestamp": datetime.now(UTC).isoformat(), **data}
    try:
        _event_queue.put_nowait(event)
    except asyncio.QueueFull:
        pass  # drop oldest-style if overloaded


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "version": "0.1.0"}


_LOCKFILE_NAMES = LOCKFILE_NAMES


def _check_scan_target(req: ScanRequest) -> None:
    """Reject a scan that cannot read anything, instead of reporting a clean or unrelated result."""
    folder = Path(req.project_path)
    if not folder.exists():
        raise HTTPException(status_code=400, detail="That folder does not exist.")
    if not folder.is_dir():
        raise HTTPException(status_code=400, detail="That path is not a directory.")
    if req.lockfile_path:
        if not Path(req.lockfile_path).is_file():
            raise HTTPException(status_code=400, detail="That lockfile does not exist.")
    elif not has_supported_lockfile(folder):
        raise HTTPException(
            status_code=400,
            detail="No supported lockfile in that folder (" + ", ".join(_LOCKFILE_NAMES) + ").",
        )


@app.post("/api/scan")
async def trigger_scan(req: ScanRequest) -> dict[str, str]:
    """Kick off a full supply-chain scan asynchronously."""
    _check_scan_target(req)
    scan_id = str(uuid.uuid4())
    _scan_store[scan_id] = {
        "id": scan_id,
        "status": "pending",
        "started_at": datetime.now(UTC).isoformat(),
        "project_path": req.project_path,
        "incidents": [],
        "token_usage": 0,
    }

    asyncio.create_task(_run_scan_task(scan_id, req, get_llm()))
    return {"scan_id": scan_id}


async def _run_scan_task(scan_id: str, req: ScanRequest, llm: LLMClient | None) -> None:
    engine = _get_engine()
    _scan_store[scan_id]["status"] = "running"
    await _push_event("scan_progress", {"scan_id": scan_id, "phase": "started"})

    try:
        # Ingest lockfile if project_path is provided
        if req.project_path:
            try:
                from .sources.ingestion import IngestorService
                ingestor = IngestorService()
                await ingestor.full_ingest(req.project_path, engine)
                await _push_event("scan_progress", {"scan_id": scan_id, "phase": "ingestion_complete"})
            except Exception as exc:
                log.warning("scan.ingest_failed", error=str(exc))

        scan_context = {
            "project_path": req.project_path,
            "ecosystem": req.ecosystem,
            "lockfile_path": req.lockfile_path,
            "last_scan_ts": None,
            "recent_ioc_campaigns": await _get_active_campaigns(engine),
            "github_org": req.github_org,
        }

        result = await run_scan(
            coral_engine=engine,
            scan_context=scan_context,
            llm=llm,
        )

        incidents = result.get("triage_output", [])

        # Upsert incidents by ID — replace existing if re-detected, add new ones
        existing_ids = {inc.get("id") for inc in _incident_store}
        new_incidents = [inc for inc in incidents if inc.get("id") not in existing_ids]
        # Update any incidents that were already stored (severity/confidence may have changed)
        for inc in incidents:
            inc_id = inc.get("id")
            if inc_id in existing_ids:
                for i, stored in enumerate(_incident_store):
                    if stored.get("id") == inc_id:
                        _incident_store[i] = inc
                        break
        _incident_store.extend(new_incidents)

        # Persist ALL current incidents to DuckDB for restart survival
        try:
            engine = _get_engine()
            await engine.execute("DELETE FROM crowsnest_incidents")
            if _incident_store:
                import json as _json
                for inc in _incident_store:
                    serialized = _json.dumps(dict(inc), default=str)
                    await engine.execute(
                        "INSERT INTO crowsnest_incidents (id, data) VALUES (:id, :data)",
                        {"id": inc.get("id", str(uuid.uuid4())), "data": serialized}
                    )
        except Exception as persist_exc:
            log.warning("scan.incident_persist_failed", error=str(persist_exc))

        _scan_store[scan_id].update({
            "status": "complete",
            "finished_at": datetime.now(UTC).isoformat(),
            "incidents": new_incidents,
            "token_usage": result.get("token_usage", 0),
            "remediation_drafts": result.get("remediation_drafts", []),
            "failed_queries": result.get("query_errors", {}),
        })

        # Bust the reputation cache so Lookout shows fresh data after scan
        global _reputation_cache_ts
        _reputation_cache_ts = 0.0

        await _push_event("scan_progress", {
            "scan_id": scan_id,
            "phase": "complete",
            "incidents_found": len(new_incidents),
            "token_usage": result.get("token_usage", 0),
        })

        for inc in new_incidents:
            if inc.get("severity") in ("CRITICAL", "HIGH"):
                await _push_event("incident_detected", inc)

    except Exception as exc:
        log.error("scan.failed", scan_id=scan_id, error=str(exc))
        _scan_store[scan_id].update({
            "status": "failed",
            "error": str(exc),
            "finished_at": datetime.now(UTC).isoformat(),
        })
        await _push_event("scan_progress", {"scan_id": scan_id, "phase": "failed", "error": str(exc)})


@app.get("/api/scan/{scan_id}/status")
async def get_scan_status(scan_id: str) -> dict[str, Any]:
    if scan_id not in _scan_store:
        raise HTTPException(status_code=404, detail="Scan not found")
    return _scan_store[scan_id]


@app.get("/api/events")
async def event_stream() -> StreamingResponse:
    """SSE stream: npm publish firehose + scan progress + incident alerts."""
    async def generator() -> AsyncIterator[str]:
        # Send current connection event
        yield f"data: {json.dumps({'type': 'connected', 'timestamp': datetime.now(UTC).isoformat()})}\n\n"

        while True:
            try:
                event = await asyncio.wait_for(_event_queue.get(), timeout=30.0)
                yield f"data: {json.dumps(event, default=str)}\n\n"
            except TimeoutError:
                yield ": keepalive\n\n"
            except Exception:
                break

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/investigate")
async def investigate(req: InvestigateRequest) -> dict[str, Any]:
    """Deep investigation of a specific package."""
    engine = _get_engine()
    results: dict[str, Any] = {"package": req.package, "version": req.version, "findings": {}}

    queries_to_run = ["MALICIOUS_PACKAGE_MATCH", "IOC_MATCH", "SHAI_HULUD", "SLEEPER_DEPENDENCY", "IDENTITY_DRIFT"]
    for qname in queries_to_run:
        try:
            sql = QueryLibrary.get(qname)
            rows = await engine.query(sql)
            pkg_rows = [r for r in rows if req.package in str(r)]
            if pkg_rows:
                results["findings"][qname] = pkg_rows[:10]
        except Exception as exc:
            log.warning("investigate.query_failed", query=qname, error=str(exc))

    # Direct npm package lookup
    npm_rows = await engine.query(
        "SELECT * FROM npm_packages WHERE name = :pkg LIMIT 1",
        {"pkg": req.package},
    )
    if npm_rows:
        results["npm_metadata"] = npm_rows[0]

    # Check socket alerts
    socket_rows = await engine.query(
        "SELECT * FROM socket_alerts WHERE package = :pkg ORDER BY first_seen DESC LIMIT 10",
        {"pkg": req.package},
    )
    results["socket_alerts"] = socket_rows

    return results


@app.post("/api/blast-radius")
async def blast_radius(req: BlastRadiusRequest) -> dict[str, Any]:
    """Compute blast radius if a specific maintainer is compromised."""
    engine = _get_engine()
    sql = QueryLibrary.get("BLAST_RADIUS")
    rows = await engine.query(sql, {"compromised_maintainer": req.maintainer})

    projects = list({r.get("our_project", "") for r in rows if r.get("our_project")})
    packages = list({r.get("compromised_root", "") for r in rows if r.get("compromised_root")})

    return {
        "maintainer": req.maintainer,
        "packages_controlled": packages,
        "affected_projects": projects,
        "total_affected_deps": len(rows),
        "blast_radius_entries": rows[:100],
        "runtime_confirmed_count": sum(
            1 for r in rows if r.get("runtime_status") != "not_observed_at_runtime"
        ),
    }


@app.post("/api/replay")
async def replay_incident(req: ReplayRequest) -> dict[str, Any]:
    """Replay an historical incident against the Time Machine snapshot."""
    engine = _get_engine()

    snapshots = engine.list_snapshots()
    target_snapshot = None

    if req.snapshot_date:
        for snap in snapshots:
            if req.snapshot_date in snap.get("name", ""):
                target_snapshot = snap["name"]
                break

    if target_snapshot:
        await engine.restore_snapshot(target_snapshot)

    # Run IOC match for the specified campaign
    ioc_rows = await engine.query(
        "SELECT * FROM shai_hulud_iocs WHERE campaign_name LIKE :campaign ORDER BY first_seen DESC",
        {"campaign": f"%{req.ioc_name}%"},
    )

    # Find affected packages
    affected_packages = [r["value"] for r in ioc_rows if r.get("ioc_type") == "package_name"]
    affected_publishers = [r["value"] for r in ioc_rows if r.get("ioc_type") == "npm_publisher"]

    # DuckDB does not accept Python lists as SQL array parameters.
    # Build an IN clause with individual named params instead.
    lockfile_rows: list[dict[str, Any]] = []
    if affected_packages or affected_publishers:
        # Build WHERE fragment for packages
        pkg_conditions: list[str] = []
        pub_conditions: list[str] = []
        params: dict[str, Any] = {}

        for i, pkg in enumerate(affected_packages[:20]):
            key = f"pkg_{i}"
            pkg_conditions.append(f"l.package = :{key}")
            params[key] = pkg

        for i, pub in enumerate(affected_publishers[:10]):
            key = f"pub_{i}"
            pub_conditions.append(f"pe.published_by = :{key}")
            params[key] = pub

        all_conditions = pkg_conditions + pub_conditions
        where_clause = " OR ".join(all_conditions) if all_conditions else "1=0"

        lockfile_rows = await engine.query(f"""
            SELECT l.*, pe.published_by
            FROM local_lockfiles l
            LEFT JOIN npm_publish_events pe ON pe.package = l.package
            WHERE {where_clause}
        """, params)

    return {
        "ioc_name": req.ioc_name,
        "snapshot_used": target_snapshot,
        "ioc_records": ioc_rows,
        "affected_lockfile_entries": lockfile_rows,
        "summary": {
            "total_iocs": len(ioc_rows),
            "affected_packages": len(affected_packages),
            "your_exposed_packages": len(lockfile_rows),
        },
    }


@app.get("/api/incidents")
async def get_incidents(
    severity: str | None = Query(default=None),
    limit: int = Query(default=50, le=500),
) -> list[dict[str, Any]]:
    """List all detected incidents."""
    incidents = list(_incident_store)
    if severity:
        incidents = [i for i in incidents if i.get("severity") == severity.upper()]
    return [dict(i) for i in incidents[:limit]]


@app.get("/api/incidents/{incident_id}")
async def get_incident(incident_id: str) -> dict[str, Any]:
    for inc in _incident_store:
        if inc.get("id") == incident_id:
            return dict(inc)
    raise HTTPException(status_code=404, detail="Incident not found")


@app.get("/api/lockfiles")
async def get_lockfiles(
    ecosystem: str | None = Query(default=None),
) -> list[dict[str, Any]]:
    """List all packages from ingested lockfiles."""
    engine = _get_engine()
    if ecosystem:
        rows = await engine.query(
            "SELECT * FROM local_lockfiles WHERE ecosystem = :eco LIMIT 1000",
            {"eco": ecosystem},
        )
    else:
        rows = await engine.query("SELECT * FROM local_lockfiles LIMIT 1000")
    return rows


@app.get("/api/maintainers/reputation")
async def maintainer_reputation(
    limit: int = Query(default=100, le=500),
) -> list[dict[str, Any]]:
    """Get maintainer reputation scores. Results are cached for 60s to keep the UI fast."""
    import time
    global _reputation_cache, _reputation_cache_ts
    if _reputation_cache and (time.time() - _reputation_cache_ts) < 60:
        log.info("reputation.cache_hit", age_s=round(time.time() - _reputation_cache_ts, 1))
        return _reputation_cache[:limit]
    engine = _get_engine()
    sql = QueryLibrary.get("MAINTAINER_REPUTATION")
    rows = await engine.query(sql)
    _reputation_cache = rows
    _reputation_cache_ts = time.time()
    return rows[:limit]


@app.post("/api/veto")
async def veto_check(req: VetoRequest) -> dict[str, Any]:
    """
    Pre-install veto check for one package version.
    Returns { blocked, reason, probability, signals, degraded, release_age_hours }.
    """
    settings = get_settings()
    return await evaluate_veto(
        _get_engine(),
        package=req.package,
        version=req.version,
        ecosystem=req.ecosystem,
        min_release_age_days=(
            settings.crowsnest_min_release_age_days if req.min_release_age_days is None else req.min_release_age_days
        ),
        live=settings.crowsnest_live_lookups,
    )


class CheckChangesRequest(BaseModel):
    project_path: str
    base_ref: str | None = None
    min_release_age_days: float | None = Field(default=None, ge=0, le=365)


@app.post("/api/check-changes")
async def check_dependency_changes(req: CheckChangesRequest) -> dict[str, Any]:
    """Vet the package versions a change adds: those in the lockfiles now but not at `base_ref`."""
    try:
        return await check_changes(
            req.project_path, base_ref=req.base_ref, engine=_get_engine(),
            min_release_age_days=req.min_release_age_days,
        )
    except CheckError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/query")
async def raw_query(req: CoralQueryRequest) -> list[dict[str, Any]]:
    """Execute a raw Coral SQL query (SELECT only — used by the CLI and dashboard)."""
    engine = _get_engine()
    try:
        rows = await engine.query(req.sql, req.params)
    except (ValueError, TypeError) as exc:
        # CoralEngine._validate_sql rejects write ops / multi-statement /
        # forbidden-keyword payloads by raising ValueError — surface that
        # as a clean 400 instead of letting it bubble up as an opaque 500.
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return rows


@app.get("/api/llm")
async def llm_status() -> dict[str, Any]:
    """Which model the agents use, if any. Never includes a key. `python -m packages.core.llm setup` changes it."""
    return describe_llm()


@app.get("/api/stats")
async def stats() -> dict[str, Any]:
    """Database statistics — used by the dashboard status bar and Slack bot."""
    engine = _get_engine()
    counts = await engine.table_stats()

    # Count distinct packages and maintainers for Slack bot
    pkg_count_res = await engine.query("SELECT COUNT(DISTINCT package) AS n FROM local_lockfiles")
    total_packages = pkg_count_res[0]["n"] if pkg_count_res else 0

    maint_count_res = await engine.query("SELECT COUNT(DISTINCT maintainer_login) AS n FROM npm_maintainers")
    total_maintainers = maint_count_res[0]["n"] if maint_count_res else 0

    # Active incidents breakdown
    active_incidents = {
        "CRITICAL": sum(1 for i in _incident_store if i.get("severity") == "CRITICAL"),
        "HIGH": sum(1 for i in _incident_store if i.get("severity") == "HIGH"),
        "MEDIUM": sum(1 for i in _incident_store if i.get("severity") == "MEDIUM"),
        "LOW": sum(1 for i in _incident_store if i.get("severity") == "LOW"),
    }

    # Find last scan metadata
    completed = [s for s in _scan_store.values() if s.get("status") == "complete"]
    if completed:
        latest = max(completed, key=lambda s: s.get("finished_at", ""))
        last_scan_at = latest.get("finished_at")
        last_scan_project = latest.get("project_path")
    else:
        last_scan_at = None
        last_scan_project = None

    return {
        # Dashboard fields
        "table_counts": counts,
        "total_incidents": len(_incident_store),
        "active_scans": sum(1 for s in _scan_store.values() if s.get("status") == "running"),
        "snapshots": engine.list_snapshots(),
        
        # Slack bot fields
        "total_packages": total_packages,
        "total_maintainers": total_maintainers,
        "active_incidents": active_incidents,
        "last_scan_at": last_scan_at,
        "last_scan_project": last_scan_project,
    }


async def _get_active_campaigns(engine: CoralEngine) -> list[str]:
    rows = await engine.query(
        "SELECT DISTINCT campaign_name FROM shai_hulud_iocs ORDER BY first_seen DESC LIMIT 10"
    )
    return [r["campaign_name"] for r in rows]


def main() -> None:
    import uvicorn
    settings = get_settings()
    uvicorn.run(
        "packages.core.api:app",
        host=settings.crowsnest_api_host,
        port=settings.crowsnest_api_port,
        reload=True,
    )


if __name__ == "__main__":
    main()
