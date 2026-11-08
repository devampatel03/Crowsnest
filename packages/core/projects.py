"""The folders Crowsnest can read when it runs in Docker, and turning what a person types into one of them.

In Docker the backend cannot read a path such as ``C:\\Users\\me\\code\\app``: it sees one shared folder, mounted at
``/projects`` (``CROWSNEST_PROJECTS_ROOT``). The folder on the user's machine that is mounted there is
``CROWSNEST_PROJECTS_HOST``. Outside Docker neither is set, and every path is used as typed.
"""

from __future__ import annotations

import re
from pathlib import Path, PurePosixPath

from .sources.lockfile import has_supported_lockfile

# How deep below the shared folder a project may sit, and how many are listed. A monorepo's packages are one level
# deeper than the repository, so two levels covers `code/app` and `code/monorepo/packages/x` is left for typing.
MAX_DEPTH = 2
MAX_PROJECTS = 200
_SKIP = {"node_modules", ".git", ".venv", "venv", "__pycache__", "dist", "build", ".next", "target"}

_WINDOWS_DRIVE = re.compile(r"^[A-Za-z]:[\\/]")


def _normal(path: str) -> str:
    """A path with forward slashes and no trailing slash, so a Windows path and a POSIX one compare alike."""
    cleaned = path.strip().strip("\"'").replace("\\", "/")
    return cleaned.rstrip("/") if len(cleaned) > 1 else cleaned


def _is_inside(path: str, base: str, *, ignore_case: bool) -> str | None:
    """The part of `path` below `base`, or None when `path` is not inside it. An empty string means `path` is `base`."""
    a, b = (path.lower(), base.lower()) if ignore_case else (path, base)
    if a == b:
        return ""
    if a.startswith(b + "/"):
        return path[len(base) + 1 :]
    return None


def resolve_scan_path(raw: str, root: str, host: str) -> str:
    """The path inside the container for what the user typed, or `raw` unchanged when it cannot be mapped.

    Accepts, in order: a path already under the shared folder; a path on the user's machine under the folder that is
    shared (Windows, macOS or Linux style); a bare folder name such as ``my-app``. Anything else is returned as typed,
    and the caller reports that it cannot be read.
    """
    typed = _normal(raw)
    if not root or not typed:
        return raw
    root_norm = _normal(root)

    below = _is_inside(typed, root_norm, ignore_case=False)
    if below is not None:
        return root_norm + ("/" + below if below else "")

    if host:
        host_norm = _normal(host)
        # Windows paths do not care about case; others do.
        below = _is_inside(typed, host_norm, ignore_case=bool(_WINDOWS_DRIVE.match(host_norm + "/")))
        if below is not None:
            return root_norm + ("/" + below if below else "")

    # A name, or a folder inside the shared one (`code/app`). `..` never climbs out of the shared folder.
    if not typed.startswith(("/", "~")) and not _WINDOWS_DRIVE.match(raw.strip().strip("\"'")):
        parts = [p for p in typed.split("/") if p not in ("", ".")]
        if parts and ".." not in parts:
            return root_norm + "/" + "/".join(parts)
    return raw


def list_projects(root: str) -> list[dict[str, str]]:
    """Folders below `root` that hold a lockfile Crowsnest reads, nearest first. Empty when `root` is unset or unreadable."""
    if not root:
        return []
    base = Path(root)
    found: list[dict[str, str]] = []

    def walk(folder: Path, depth: int) -> None:
        if len(found) >= MAX_PROJECTS:
            return
        try:
            children = sorted((c for c in folder.iterdir() if c.is_dir() and c.name not in _SKIP and not c.name.startswith(".")), key=lambda c: c.name.lower())
        except OSError:
            return
        for child in children:
            if len(found) >= MAX_PROJECTS:
                return
            if has_supported_lockfile(child):
                found.append({"name": str(PurePosixPath(child.relative_to(base).as_posix())), "path": child.as_posix()})
            if depth < MAX_DEPTH:
                walk(child, depth + 1)

    if has_supported_lockfile(base):
        found.append({"name": base.name or "projects", "path": base.as_posix()})
    walk(base, 1)
    return found
