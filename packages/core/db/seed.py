"""Load seed data into the CoralDB at startup."""

from __future__ import annotations

import json
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

import structlog

log = structlog.get_logger(__name__)

_SEED_DIR = Path(__file__).parent.parent.parent.parent / "coral-config" / "seed-data"


async def seed_database(engine: Any) -> None:
    """Idempotent seed: only inserts rows that don't already exist."""
    from ..coral.engine import CoralEngine  # avoid circular import
    assert isinstance(engine, CoralEngine)

    await _seed_shai_hulud_iocs(engine)
    await _seed_hallucination_patterns(engine)
    await _seed_maintainer_data(engine)
    log.info("seed.complete")


async def _seed_shai_hulud_iocs(engine: Any) -> None:
    ioc_file = _SEED_DIR / "shai_hulud_iocs.json"
    if not ioc_file.exists():
        log.warning("seed.ioc_file_missing", path=str(ioc_file))
        return

    records = json.loads(ioc_file.read_text())
    for r in records:
        if isinstance(r.get("first_seen"), str):
            try:
                r["first_seen"] = datetime.fromisoformat(r["first_seen"].replace("Z", "+00:00"))
            except ValueError:
                r["first_seen"] = None

    await engine.ingest("shai_hulud_iocs", records)
    log.info("seed.shai_hulud_iocs", count=len(records))


async def _seed_hallucination_patterns(engine: Any) -> None:
    patterns_file = _SEED_DIR / "known_hallucination_patterns.json"
    if not patterns_file.exists():
        log.warning("seed.patterns_file_missing", path=str(patterns_file))
        return

    records = json.loads(patterns_file.read_text())
    await engine.ingest("known_hallucination_patterns", records)
    log.info("seed.hallucination_patterns", count=len(records))


async def _seed_maintainer_data(engine: Any) -> None:
    """
    Seed npm_maintainers and gh_commits with realistic varied data.

    Key constraints:
    - npm_maintainers has NO primary key → use raw INSERT OR IGNORE via direct SQL
    - gh_commits.files_changed is TEXT[] → must pass None (not []) to avoid JSON string mismatch
    - Logins must match what UNNEST(npm_packages.maintainers) returns
    """
    import asyncio

    # Check if we already seeded (avoid re-seeding on every restart)
    existing_commits = await engine.query(
        "SELECT COUNT(*) AS n FROM gh_commits WHERE author_email LIKE '%@crowsnest-seed%'"
    )
    if existing_commits and existing_commits[0].get("n", 0) > 0:
        log.info("seed.maintainer_data_already_present", commits=existing_commits[0]["n"])
        return

    # Get the actual logins that exist in npm_packages.maintainers[]
    # DuckDB UNNEST works on TEXT[] columns directly
    try:
        existing = await engine.query(
            "SELECT DISTINCT UNNEST(maintainers) AS login FROM npm_packages LIMIT 50"
        )
        logins = [r["login"] for r in existing if r.get("login") and isinstance(r["login"], str)]
    except Exception as exc:
        log.warning("seed.maintainers_unnest_failed", error=str(exc))
        logins = []

    if not logins:
        # Fallback: well-known npm maintainers that are likely in the lockfile
        logins = [
            "sindresorhus", "isaacs", "ljharb", "nicolo-ribaudo",
            "zkat", "evocateur", "iarna", "bcoe", "wesleytodd",
            "antfu", "patak-dev", "Rich-Harris", "babel",
            "nicolo", "sheremet-va",
        ]

    rng = random.Random(42)  # reproducible, avoids polluting global state
    now = datetime.now(timezone.utc)

    # ── npm_maintainers (platform age) ─────────────────────────────────────
    # NOTE: npm_maintainers has NO PRIMARY KEY → engine.ingest() will fail on
    # ON CONFLICT DO UPDATE. Use direct raw INSERT via the engine's connection.
    npm_maintainer_records: list[dict] = []
    for login in logins:
        # 10% new (<180 days), 90% established (500–2500 days)
        if rng.random() < 0.1:
            days_ago = rng.randint(30, 170)
        else:
            days_ago = rng.randint(500, 2500)

        first_seen = now - timedelta(days=days_ago)
        # Use the login itself as a dummy package — just needs a non-null value
        npm_maintainer_records.append({
            "package":          login,
            "maintainer_login": login,
            "action":           "add",
            "ts":               first_seen.isoformat(),
            "performed_by":     None,
        })

    # Seed npm_maintainers using raw SQL (bypasses ON CONFLICT issue on no-PK table)
    if npm_maintainer_records:
        await _raw_insert_npm_maintainers(engine, npm_maintainer_records)
        log.info("seed.npm_maintainers", count=len(npm_maintainer_records))

    # ── gh_commits (activity + GPG signing) ────────────────────────────────
    # IMPORTANT: files_changed is TEXT[] in schema.
    # _coerce() converts [] → '[]' (a JSON string), which DuckDB rejects for TEXT[].
    # We must pass None for files_changed so it becomes NULL (accepted for TEXT[]).
    repos = [
        "github.com/user/repo-a",
        "github.com/user/repo-b",
        "github.com/user/repo-c",
    ]
    gh_commit_records: list[dict] = []

    for login in logins:
        # 70% active (15–80 commits), 30% dormant (0–3 commits)
        if rng.random() < 0.7:
            commit_count = rng.randint(15, 80)
            gpg_ratio = rng.uniform(0.5, 1.0)   # frequently sign
        else:
            commit_count = rng.randint(0, 3)
            gpg_ratio = rng.uniform(0.0, 0.3)   # rarely sign

        for i in range(commit_count):
            days_ago = rng.randint(0, 89)
            commit_ts = now - timedelta(days=days_ago, hours=rng.randint(0, 23))
            gpg_ok = rng.random() < gpg_ratio
            msg_len = rng.randint(20, 120)

            gh_commit_records.append({
                "sha":             f"{login}-seed-{i}-{days_ago}",
                "repo":            rng.choice(repos),
                "author_login":    login,
                "author_email":    f"{login}@crowsnest-seed.local",
                "committer_login": login,
                "ts":              commit_ts.isoformat(),
                "message":         "x" * msg_len,
                "gpg_verified":    gpg_ok,
                "signed_by":       login if gpg_ok else None,
                "is_merge":        False,
                "parent_count":    1,
                # Pass None so DuckDB stores NULL for TEXT[] column (not JSON string '[]')
                "files_changed":   None,
            })

    if gh_commit_records:
        await engine.ingest("gh_commits", gh_commit_records)
        log.info("seed.gh_commits", count=len(gh_commit_records))

    # ── IOC-flag 1–2 maintainers via npm_publish_events + shai_hulud_iocs ─
    ioc_candidates = logins[:2] if len(logins) >= 2 else logins
    ioc_records: list[dict] = []
    shai_records: list[dict] = []

    for login in ioc_candidates:
        ioc_records.append({
            "package":           f"{login}-malicious-pkg",
            "version":           "1.0.0",
            "published_at":      (now - timedelta(days=rng.randint(1, 30))).isoformat(),
            "published_by":      login,
            "npm_org":           None,
            "publish_via":       "cli",
            "source_ip_country": "XX",
        })
        shai_records.append({
            "campaign_name": "seed-demo-campaign",
            "ioc_type":      "npm_maintainer",
            "value":         login,
            "first_seen":    (now - timedelta(days=rng.randint(1, 30))).isoformat(),
            "attribution":   "seed-data",
            "attack_wave":   "demo",
        })

    if ioc_records:
        await engine.ingest("npm_publish_events", ioc_records)
        log.info("seed.npm_publish_events_ioc", count=len(ioc_records))
    if shai_records:
        await engine.ingest("shai_hulud_iocs", shai_records)
        log.info("seed.shai_hulud_iocs_maintainer", count=len(shai_records))


async def _raw_insert_npm_maintainers(engine: Any, records: list[dict]) -> None:
    """
    Insert npm_maintainer rows using raw SQL to avoid ON CONFLICT issues
    (npm_maintainers has no PRIMARY KEY so engine.ingest()'s upsert fails).
    We use a SELECT-based existence check per login instead.
    """
    import asyncio

    # Check which logins are already present
    existing_rows = await engine.query(
        "SELECT DISTINCT maintainer_login FROM npm_maintainers"
    )
    existing_logins = {r["maintainer_login"] for r in existing_rows}

    # Only insert truly new logins
    new_records = [r for r in records if r["maintainer_login"] not in existing_logins]
    if not new_records:
        return

    # Use the engine's internal connection via executor for raw INSERT
    def _do_insert() -> None:
        conn = engine._get_connection()
        sql = (
            "INSERT INTO npm_maintainers (package, maintainer_login, action, ts, performed_by) "
            "VALUES (?, ?, ?, ?, ?)"
        )
        vals = [
            (r["package"], r["maintainer_login"], r["action"], r["ts"], r.get("performed_by"))
            for r in new_records
        ]
        conn.executemany(sql, vals)

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _do_insert)


# Allow importing Any before full type resolution
from typing import Any
