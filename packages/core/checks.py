"""
Dependency-change check: vet only the package versions a change adds.

Compares a project's lockfiles with their state at a git ref (usually the pull request's base branch) and runs the
install veto on every package version that is new or changed. It runs on its own, with no server:

    python -m packages.core.checks <project> --base origin/main

and exits 1 when a version should not be merged, so a CI job can fail the pull request.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

import structlog

from .config import get_settings
from .coral.engine import CoralEngine
from .sources.ingestion import IngestorService
from .sources.lockfile import LOCKFILE_NAMES, LockfileSource
from .veto import evaluate

log = structlog.get_logger(__name__)

# A ref is a branch, tag, SHA or relative name. It can never start with '-', so it cannot be read as a git option.
_SAFE_REF = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/@~^{}-]*$")
_MANIFESTS = ("package.json", "composer.json", "Pipfile")
_CONCURRENCY = 6


class CheckError(Exception):
    """The check could not run (bad ref, not a git repository)."""


async def check_changes(
    project_path: str,
    *,
    base_ref: str | None = None,
    engine: CoralEngine | None = None,
    min_release_age_days: float | None = None,
    live: bool | None = None,
    ingestor: IngestorService | None = None,
    osv: Any = None,
) -> dict[str, Any]:
    """Veto every package version in `project_path` that is not in the lockfiles at `base_ref`.

    With no `base_ref` every version in the lockfiles is checked.
    """
    settings = get_settings()
    root = Path(project_path)
    if not root.is_dir():
        raise CheckError(f"{project_path} is not a folder")
    live = settings.crowsnest_live_lookups if live is None else live
    min_age = settings.crowsnest_min_release_age_days if min_release_age_days is None else min_release_age_days

    reader = LockfileSource()
    current = await asyncio.to_thread(reader.detect_and_parse, str(root))
    previous: list[dict[str, Any]] = []
    if base_ref:
        previous = await asyncio.to_thread(_records_at_ref, root, base_ref)

    before: dict[tuple[str, str], set[str]] = {}
    for r in previous:
        before.setdefault((r["ecosystem"], r["package"]), set()).add(r["version"])
    changed = sorted({
        (r["ecosystem"], r["package"], r["version"])
        for r in current
        if r["version"] not in before.get((r["ecosystem"], r["package"]), set())
    })

    own_engine = engine is None
    if engine is None:
        snapshots = tempfile.mkdtemp(prefix="crowsnest-check-")
        engine = CoralEngine(db_path=":memory:", snapshot_dir=snapshots)
        await engine.initialize_schema()
    service = ingestor or IngestorService()
    semaphore = asyncio.Semaphore(_CONCURRENCY)

    async def vet(eco: str, name: str, version: str) -> dict[str, Any]:
        async with semaphore:
            verdict = await evaluate(
                engine, package=name, version=version, ecosystem=eco, min_release_age_days=min_age,
                live=live, ingestor=service, osv=osv,
            )
        old = sorted(before.get((eco, name), set()))
        return {**verdict, "change": "updated" if old else "added", "previous_versions": old}

    try:
        results = await asyncio.gather(*[vet(*c) for c in changed])
    finally:
        if own_engine:
            conn = getattr(engine, "_conn", None)
            if conn is not None:
                conn.close()

    blocked = [r for r in results if r["blocked"]]
    return {
        "base_ref": base_ref,
        "project_path": str(root),
        "checked": len(results),
        "unchanged": len({(r["ecosystem"], r["package"], r["version"]) for r in current}) - len(results),
        "blocked": blocked,
        "degraded": sorted({d for r in results for d in r["degraded"]}),
        "results": results,
    }


def _records_at_ref(root: Path, ref: str) -> list[dict[str, Any]]:
    """Lockfile rows as they were at `ref`, read with `git show` into a scratch folder (never into the repo)."""
    if not _SAFE_REF.match(ref):
        raise CheckError(f"{ref!r} is not a usable git ref")
    listing = _git(root, "ls-tree", "--name-only", ref)
    wanted = [
        n for n in listing.splitlines()
        if n in LOCKFILE_NAMES or n in _MANIFESTS or re.fullmatch(r"requirements.*\.txt", n)
    ]
    with tempfile.TemporaryDirectory(prefix="crowsnest-base-") as scratch:
        for name in wanted:
            Path(scratch, name).write_text(_git(root, "show", f"{ref}:./{name}"), encoding="utf-8")
        return LockfileSource().detect_and_parse(scratch)


def _git(root: Path, *args: str) -> str:
    git = shutil.which("git")
    if git is None:
        raise CheckError("git is not installed, so the base version of the lockfiles cannot be read")
    try:
        done = subprocess.run(  # noqa: S603 (fixed argument list, no shell; the ref is validated above)
            [git, "-C", str(root), *args],
            capture_output=True, encoding="utf-8", errors="replace", timeout=30, check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise CheckError(f"git could not run: {exc}") from exc
    if done.returncode != 0:
        raise CheckError(f"git {args[0]} failed: {done.stderr.strip() or 'unknown error'}")
    return done.stdout


def render(report: dict[str, Any]) -> str:
    """Plain-language summary for a terminal or a CI log."""
    lines = []
    scope = f"changed since {report['base_ref']}" if report["base_ref"] else "in the lockfiles"
    lines.append(f"Crowsnest checked {report['checked']} package version(s) {scope}.")
    for r in report["results"]:
        mark = "BLOCKED" if r["blocked"] else "ok"
        what = f"{r['package']}@{r['version']}"
        if r["change"] == "updated":
            what += f" (was {', '.join(r['previous_versions'])})"
        lines.append(f"  [{mark}] {what}")
        if r["blocked"] or r["signals"]:
            lines.extend(f"      - {s}" for s in r["signals"])
    for note in report["degraded"]:
        lines.append(f"  Note: {note}")
    lines.append(
        f"{len(report['blocked'])} version(s) should not be merged." if report["blocked"] else "Nothing to block.",
    )
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m packages.core.checks", description=__doc__)
    parser.add_argument("project", nargs="?", default=".", help="project folder (default: current folder)")
    parser.add_argument("--base", help="git ref to compare with, such as origin/main; omit to check everything")
    parser.add_argument("--min-release-age", type=float, help="days a version must be public (default: setting)")
    parser.add_argument("--format", choices=("text", "json"), default="text")
    parser.add_argument("--offline", action="store_true", help="do not query registries or the malware feed")
    parser.add_argument("--fail-on-degraded", action="store_true", help="exit 2 if a lookup could not be made")
    args = parser.parse_args(argv)
    try:
        report = asyncio.run(check_changes(
            args.project, base_ref=args.base, min_release_age_days=args.min_release_age,
            live=False if args.offline else None,
        ))
    except CheckError as exc:
        print(f"Crowsnest could not run the check: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(report, indent=2, default=str) if args.format == "json" else render(report))
    if os.environ.get("GITHUB_ACTIONS") == "true":
        for r in report["blocked"]:
            first = r["signals"][0] if r["signals"] else "blocked"
            print(f"::error title=Crowsnest blocked {r['package']}@{r['version']}::{first}")
    if report["blocked"]:
        return 1
    return 2 if args.fail_on_degraded and report["degraded"] else 0


if __name__ == "__main__":
    sys.exit(main())
