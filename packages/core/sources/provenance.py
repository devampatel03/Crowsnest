"""
Build provenance: which source repository a registry says a release was built from.

A release published with provenance carries a signed statement naming the repository and workflow that built it.
A release whose statement names a different repository than the previous release did is the signature of the
2026 litellm compromise: the genuine pipeline ran against an attacker's fork one hyphen away from the real name.
"""

from __future__ import annotations

import base64
import json
import re
from collections.abc import Iterable, Mapping
from datetime import UTC, datetime, timedelta
from typing import Any

# Per-release details (provenance, dependencies, size) are fetched only where a "what changed" comparison needs
# them: for the versions asked about and the release before each. With no versions named, the newest few releases
# from the last DETAIL_WINDOW_DAYS days. A package that publishes daily (litellm) would otherwise cost dozens of
# requests per lookup.
DETAIL_WINDOW_DAYS = 30
DETAIL_RECENT_LIMIT = 5

_VERSION_NUMBERS = re.compile(r"^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?")


def recent_with_predecessor(
    published: Mapping[str, datetime | None],
    days: int = DETAIL_WINDOW_DAYS,
    now: datetime | None = None,
    focus: Iterable[str] | None = None,
    limit: int = DETAIL_RECENT_LIMIT,
) -> set[str]:
    """The versions to collect details for: those asked about (`focus`), else the newest recent ones, and the
    next lower version on the same major line for each.

    The predecessor matches the RELEASE_ANOMALY query: a release is compared with the previous version on its own
    major line (pre-releases only with pre-releases), so a 2.0.55 backport published after 2.1.4 brings in 2.0.54.
    """
    lines: dict[tuple[int, bool], list[tuple[tuple[int, int, int], str]]] = {}
    for version in published:
        line, order = _line_and_order(version)
        lines.setdefault(line, []).append((order, version))
    previous: dict[str, str] = {}
    for members in lines.values():
        members.sort()
        for i in range(1, len(members)):
            previous[members[i][1]] = members[i - 1][1]

    if focus is not None:
        asked = [v for v in focus if v in published]
    else:
        cutoff = (now or datetime.now(UTC).replace(tzinfo=None)) - timedelta(days=days)
        recent = sorted(
            ((_naive(t), v) for v, t in published.items() if t and _naive(t) >= cutoff), reverse=True,
        )
        asked = [v for _, v in recent[:limit]]
    chosen = set(asked)
    chosen.update(previous[v] for v in asked if v in previous)
    return chosen


def _line_and_order(version: str) -> tuple[tuple[int, bool], tuple[int, int, int]]:
    match = _VERSION_NUMBERS.match(version)
    numbers = tuple(int(g) if g else 0 for g in match.groups()) if match else (0, 0, 0)
    prerelease = bool(re.search(r"[A-Za-z-]", version.removeprefix("v")))
    return (numbers[0], prerelease), (numbers[0], numbers[1], numbers[2])


def npm_provenance_repo(attestations: dict[str, Any] | None) -> str | None:
    """Repository URL from an npm attestations document (`dist.attestations.url`), or None."""
    for entry in (attestations or {}).get("attestations", []) or []:
        if "slsa.dev/provenance" not in str(entry.get("predicateType", "")):
            continue
        try:
            payload = json.loads(base64.b64decode(entry["bundle"]["dsseEnvelope"]["payload"]))
            params = payload["predicate"]["buildDefinition"]["externalParameters"]
        except (KeyError, TypeError, ValueError):
            continue
        repo = ((params.get("workflow") or {}).get("repository")) or params.get("sourceRepository")
        if isinstance(repo, str) and repo:
            return repo
    return None


def pypi_provenance_repo(provenance: dict[str, Any] | None) -> str | None:
    """Repository URL from a PyPI provenance document (`/integrity/.../provenance`), or None."""
    hosts = {"github": "https://github.com/", "gitlab": "https://gitlab.com/"}
    for bundle in (provenance or {}).get("attestation_bundles", []) or []:
        publisher = bundle.get("publisher") or {}
        repo, host = publisher.get("repository"), hosts.get(str(publisher.get("kind", "")).lower())
        if isinstance(repo, str) and repo and host:
            return host + repo
    return None


def _naive(when: datetime) -> datetime:
    return when.astimezone(UTC).replace(tzinfo=None) if when.tzinfo else when
