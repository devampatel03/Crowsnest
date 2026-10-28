"""
Local lockfile parser + AI-authored likelihood scorer.

Parses package-lock.json, pnpm-lock.yaml, poetry.lock, Cargo.lock, go.sum
and source file imports (.js, .ts, .py, .rs).
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import structlog

from ..ecosystems import COMPOSER, PYPI, RUBYGEMS, normalize_package_name
from .base import DataSource

log = structlog.get_logger(__name__)

try:
    import tomllib
except ImportError:
    try:
        import tomli as tomllib  # type: ignore[no-redef]
    except ImportError:
        tomllib = None  # type: ignore[assignment]

try:
    import yaml
except ImportError:
    yaml = None  # type: ignore[assignment]


LOCKFILE_NAMES = (
    "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "poetry.lock", "uv.lock", "Pipfile.lock",
    "composer.lock", "Gemfile.lock", "Cargo.lock", "go.sum", "requirements.txt",
)


def has_supported_lockfile(folder: Path) -> bool:
    """True when `folder` holds a file the readers understand (any requirements*.txt counts)."""
    return any((folder / n).is_file() for n in LOCKFILE_NAMES) or any(folder.glob("requirements*.txt"))


class LockfileSource(DataSource):
    name = "lockfile"
    tables = ["local_lockfiles", "local_source_packages_mentioned"]

    async def fetch(self, project_path: str = "", **kwargs: Any) -> list[dict[str, Any]]:
        if project_path:
            return self.detect_and_parse(project_path)
        return []

    def detect_and_parse(self, project_path: str) -> list[dict[str, Any]]:
        """Auto-detect lockfile type and return unified local_lockfiles records."""
        path = Path(project_path)
        records: list[dict[str, Any]] = []

        parsers: list[tuple[str, Any]] = [
            ("package-lock.json", self.parse_package_lock),
            ("pnpm-lock.yaml", self.parse_pnpm_lock),
            ("yarn.lock", self.parse_yarn_lock),
            ("poetry.lock", self.parse_poetry_lock),
            ("uv.lock", self.parse_uv_lock),
            ("Pipfile.lock", self.parse_pipfile_lock),
            ("composer.lock", self.parse_composer_lock),
            ("Gemfile.lock", self.parse_gemfile_lock),
            ("Cargo.lock", self.parse_cargo_lock),
            ("go.sum", self.parse_go_sum),
        ]
        parsers += [(f.name, self.parse_requirements) for f in sorted(path.glob("requirements*.txt"))]
        for lockfile_name, parser in parsers:
            lockfile_path = path / lockfile_name
            if lockfile_path.is_file():
                try:
                    parsed = parser(str(lockfile_path))
                    for r in parsed:
                        r["project_path"] = str(path)
                    records.extend(parsed)
                    log.info("lockfile.parsed", file=lockfile_name, count=len(parsed))
                except Exception as exc:
                    log.error("lockfile.parse_error", file=lockfile_name, error=str(exc))

        _mark_direct_from_manifest(records, path)
        return _finalise(records)

    def parse_package_lock(self, path: str) -> list[dict[str, Any]]:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)

        records: list[dict[str, Any]] = []
        lockfile_version = data.get("lockfileVersion", 1)
        direct_deps = set()

        # Collect direct dependencies from package.json if adjacent
        pkg_json_path = Path(path).parent / "package.json"
        if pkg_json_path.exists():
            try:
                pkg_json = json.loads(pkg_json_path.read_text())
                direct_deps = set(
                    list(pkg_json.get("dependencies", {}).keys())
                    + list(pkg_json.get("devDependencies", {}).keys())
                )
            except Exception:
                pass

        if lockfile_version >= 2:
            # v2/v3 format: packages key
            for pkg_path, pkg_data in data.get("packages", {}).items():
                if pkg_path == "":
                    continue  # root package
                # Strip node_modules/ prefix
                name = pkg_path.removeprefix("node_modules/")
                # Handle nested: node_modules/a/node_modules/b
                if "/node_modules/" in name:
                    name = name.rsplit("/node_modules/", 1)[-1]

                version = pkg_data.get("version", "")
                parent_chain = _extract_parent_chain(pkg_path)

                # Primary signal: structural depth in the packages map.
                # node_modules/foo          → direct (no nested node_modules)
                # node_modules/foo/node_modules/bar → transitive
                # If package.json is present, use it as an override when it
                # explicitly lists (or excludes) the package.
                is_nested = "/node_modules/" in pkg_path
                if direct_deps:
                    declared_in = "direct" if name in direct_deps else "transitive"
                else:
                    declared_in = "transitive" if is_nested else "direct"

                records.append({
                    "ecosystem": "npm",
                    "package": name,
                    "version": version,
                    "integrity_hash": pkg_data.get("integrity", ""),
                    "resolved_url": pkg_data.get("resolved", ""),
                    "declared_in": declared_in,
                    "parent_chain": parent_chain,
                })
        else:
            # v1 format: dependencies key
            def _walk(deps: dict, parent_chain: list[str]) -> None:
                for name, dep_data in deps.items():
                    # Primary signal: empty parent_chain means top-level entry
                    # (direct). Non-empty means nested inside another dep
                    # (transitive). Honor package.json when available.
                    if direct_deps:
                        declared_in = "direct" if name in direct_deps else "transitive"
                    else:
                        declared_in = "direct" if not parent_chain else "transitive"
                    records.append({
                        "ecosystem": "npm",
                        "package": name,
                        "version": dep_data.get("version", ""),
                        "integrity_hash": dep_data.get("integrity", ""),
                        "resolved_url": dep_data.get("resolved", ""),
                        "declared_in": declared_in,
                        "parent_chain": list(parent_chain),
                    })
                    if dep_data.get("dependencies"):
                        _walk(dep_data["dependencies"], parent_chain + [name])

            _walk(data.get("dependencies", {}), [])

        return records

    def parse_pnpm_lock(self, path: str) -> list[dict[str, Any]]:
        if yaml is None:
            log.warning("lockfile.pnpm_yaml_missing")
            return []

        with open(path, encoding="utf-8") as f:
            data = yaml.safe_load(f)

        if not data:
            return []

        records = []
        # pnpm-lock.yaml v6+: packages section
        for pkg_key, pkg_data in (data.get("packages") or {}).items():
            # pkg_key: /lodash/4.17.21 or lodash@4.17.21
            name, version = _parse_pnpm_key(pkg_key)
            if not name:
                continue
            records.append({
                "ecosystem": "npm",
                "package": name,
                "version": version,
                "integrity_hash": (pkg_data or {}).get("resolution", {}).get("integrity", ""),
                "resolved_url": "",
                "declared_in": "transitive",
                "parent_chain": [],
            })
        return records

    def parse_yarn_lock(self, path: str) -> list[dict[str, Any]]:
        """Parse yarn.lock, both the classic format and Yarn 2+ ("berry")."""
        with open(path, encoding="utf-8") as f:
            lines = f.read().splitlines()
        berry = any(line.startswith("__metadata:") for line in lines)
        records: list[dict[str, Any]] = []
        current: dict[str, Any] = {}

        def flush() -> None:
            if current.get("package") and current.get("version"):
                records.append(current)

        for line in lines:
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            if not line.startswith(" "):
                flush()
                current = {}
                name_match = re.match(r'"?(@?[^@"\s,:]+)@', line)
                if name_match and not line.startswith("__metadata"):
                    current = {"package": name_match.group(1), "ecosystem": "npm", "declared_in": "transitive",
                               "parent_chain": [], "integrity_hash": "", "resolved_url": "", "version": ""}
                continue
            if not current:
                continue
            if line.startswith("  version"):
                v_match = re.match(r'  version:? "?([^"\s]+)"?\s*$', line)
                if v_match:
                    current["version"] = v_match.group(1)
            elif line.startswith("  resolved "):
                r_match = re.search(r'resolved "([^"]+)"', line)
                if r_match:
                    current["resolved_url"] = r_match.group(1)
            elif line.startswith("  integrity "):
                i_match = re.search(r"integrity (sha\S+)", line)
                if i_match:
                    current["integrity_hash"] = i_match.group(1)
            elif berry and line.startswith("  checksum:"):
                current["integrity_hash"] = line.split(":", 1)[1].strip()
            elif berry and line.startswith("  resolution:") and (
                "@workspace:" in line or "@file:" in line or "@portal:" in line or "@link:" in line
            ):
                current = {}  # the project's own packages are not registry packages
        flush()
        return records

    def parse_poetry_lock(self, path: str) -> list[dict[str, Any]]:
        if tomllib is None:
            log.warning("lockfile.poetry_toml_missing")
            return self._parse_poetry_regex(path)

        with open(path, "rb") as f:
            data = tomllib.load(f)

        records = []
        for pkg in data.get("package", []):
            records.append({
                "ecosystem": "pypi",
                "package": pkg.get("name", ""),
                "version": pkg.get("version", ""),
                "integrity_hash": "",
                "resolved_url": "",
                "declared_in": "direct" if pkg.get("category", "") == "main" else "transitive",
                "parent_chain": [],
            })
        return records

    def _parse_poetry_regex(self, path: str) -> list[dict[str, Any]]:
        records = []
        with open(path, encoding="utf-8") as f:
            content = f.read()
        for match in re.finditer(r'\[\[package\]\]\r?\nname = "([^"]+)"\r?\nversion = "([^"]+)"', content):
            records.append({
                "ecosystem": "pypi",
                "package": match.group(1),
                "version": match.group(2),
                "integrity_hash": "", "resolved_url": "",
                "declared_in": "transitive", "parent_chain": [],
            })
        return records

    def parse_requirements(self, path: str) -> list[dict[str, Any]]:
        """Exactly pinned (``name==1.2.3``) requirements. Unpinned ones name no single version to check."""
        with open(path, encoding="utf-8", errors="replace") as f:
            text = f.read().replace("\\\n", " ")
        records: list[dict[str, Any]] = []
        unpinned = 0
        for raw in text.splitlines():
            line = re.sub(r"(^|\s)#.*$", "", raw).strip()
            if not line or line.startswith("-"):
                continue
            m = _REQUIREMENT_PIN.match(line)
            if m and not m.group(2).endswith("*"):
                records.append({
                    "ecosystem": PYPI, "package": m.group(1), "version": m.group(2), "integrity_hash": "",
                    "resolved_url": "", "declared_in": "direct", "parent_chain": [],
                })
            else:
                unpinned += 1
        if unpinned:
            log.warning("lockfile.requirements_unpinned", file=Path(path).name, count=unpinned)
        return records

    def parse_uv_lock(self, path: str) -> list[dict[str, Any]]:
        if tomllib is None:
            return []
        with open(path, "rb") as f:
            data = tomllib.load(f)
        packages = data.get("package", [])
        direct: set[str] = set()
        roots: set[str] = set()
        for pkg in packages:
            source = pkg.get("source") or {}
            if source.get("virtual") == "." or source.get("editable") == ".":
                roots.add(pkg.get("name", ""))
                direct.update(d.get("name", "") for d in pkg.get("dependencies", []))
                for group in (pkg.get("dev-dependencies") or {}).values():
                    direct.update(d.get("name", "") for d in group)
                for group in (pkg.get("optional-dependencies") or {}).values():
                    direct.update(d.get("name", "") for d in group)
        records = []
        for pkg in packages:
            name = pkg.get("name", "")
            if name in roots or "registry" not in (pkg.get("source") or {}):
                continue  # the project itself, or a git/path dependency no registry feed covers
            records.append({
                "ecosystem": PYPI, "package": name, "version": pkg.get("version", ""),
                "integrity_hash": ((pkg.get("sdist") or {}).get("hash") or ""),
                "resolved_url": (pkg.get("source") or {}).get("registry", ""),
                "declared_in": "direct" if name in direct else "transitive", "parent_chain": [],
            })
        return records

    def parse_pipfile_lock(self, path: str) -> list[dict[str, Any]]:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        direct: set[str] = set()
        pipfile = Path(path).parent / "Pipfile"
        if pipfile.is_file() and tomllib is not None:
            with open(pipfile, "rb") as f:
                manifest = tomllib.load(f)
            direct = {normalize_package_name(PYPI, n) for sec in ("packages", "dev-packages")
                      for n in (manifest.get(sec) or {})}
        records = []
        for section in ("default", "develop"):
            for name, info in (data.get(section) or {}).items():
                info = info or {}
                version = str(info.get("version", "")).removeprefix("==")
                if not version:
                    continue  # VCS and path dependencies carry no registry version
                is_direct = normalize_package_name(PYPI, name) in direct
                records.append({
                    "ecosystem": PYPI, "package": name, "version": version,
                    "integrity_hash": (info.get("hashes") or [""])[0], "resolved_url": "",
                    "declared_in": "direct" if is_direct else "transitive", "parent_chain": [],
                })
        return records

    def parse_composer_lock(self, path: str) -> list[dict[str, Any]]:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        direct: set[str] = set()
        manifest = Path(path).parent / "composer.json"
        if manifest.is_file():
            try:
                parsed = json.loads(manifest.read_text(encoding="utf-8"))
                direct = {normalize_package_name(COMPOSER, n)
                          for sec in ("require", "require-dev") for n in (parsed.get(sec) or {})}
            except (OSError, ValueError):
                pass
        records = []
        for section in ("packages", "packages-dev"):
            for pkg in data.get(section) or []:
                name = pkg.get("name", "")
                is_direct = normalize_package_name(COMPOSER, name) in direct
                records.append({
                    "ecosystem": COMPOSER, "package": name, "version": pkg.get("version", ""),
                    "integrity_hash": (pkg.get("dist") or {}).get("shasum", "") or "",
                    "resolved_url": (pkg.get("dist") or {}).get("url", "") or "",
                    "declared_in": "direct" if is_direct else "transitive", "parent_chain": [],
                })
        return records

    def parse_gemfile_lock(self, path: str) -> list[dict[str, Any]]:
        with open(path, encoding="utf-8") as f:
            lines = f.read().splitlines()
        records: list[dict[str, Any]] = []
        direct: set[str] = set()
        section = ""
        for line in lines:
            if line and not line.startswith(" "):
                section = line.strip()
                continue
            if section == "GEM":
                m = _GEM_SPEC.match(line)
                if m:
                    records.append({
                        "ecosystem": RUBYGEMS, "package": m.group(1), "version": m.group(2), "integrity_hash": "",
                        "resolved_url": "", "declared_in": "transitive", "parent_chain": [],
                    })
            elif section == "DEPENDENCIES":
                m = re.match(r"^  ([A-Za-z0-9_.-]+)", line)
                if m:
                    direct.add(m.group(1))
        for r in records:
            if r["package"] in direct:
                r["declared_in"] = "direct"
        return records

    def parse_cargo_lock(self, path: str) -> list[dict[str, Any]]:
        if tomllib is None:
            return []

        with open(path, "rb") as f:
            data = tomllib.load(f)

        records = []
        for pkg in data.get("package", []):
            # Crates without a registry source are the workspace's own or git/path dependencies.
            if not str(pkg.get("source", "")).startswith("registry+"):
                continue
            records.append({
                "ecosystem": "cargo",
                "package": pkg.get("name", ""),
                "version": pkg.get("version", ""),
                "integrity_hash": pkg.get("checksum", ""),
                "resolved_url": "",
                "declared_in": "transitive",
                "parent_chain": [],
            })
        return records

    def parse_go_sum(self, path: str) -> list[dict[str, Any]]:
        records = []
        with open(path, encoding="utf-8") as f:
            for line in f:
                parts = line.strip().split()
                if len(parts) >= 3:
                    module_version = parts[0]
                    version = parts[1]
                    integrity = parts[2]
                    if version.endswith("/go.mod"):
                        continue  # skip go.mod-only entries
                    records.append({
                        "ecosystem": "go",
                        "package": module_version,
                        "version": version,
                        "integrity_hash": integrity,
                        "resolved_url": "",
                        "declared_in": "transitive",
                        "parent_chain": [],
                    })
        return records

    def scan_source_imports(self, project_path: str) -> list[dict[str, Any]]:
        """
        Walk source files and extract import statements with
        AI-authored likelihood scores.
        """
        path = Path(project_path)
        records: list[dict[str, Any]] = []

        # Try to get git blame data
        git_blame_data = _load_git_blame_data(path)

        patterns: list[tuple[str, str, re.Pattern]] = [
            ("npm", "js_ts", re.compile(
                r'''(?:import\s+(?:.*?\s+from\s+)?|require\s*\(\s*)['"](@?[a-zA-Z0-9_\-./]+)['"]''',
            )),
            ("pypi", "python", re.compile(
                r'''(?:^import\s+([a-zA-Z0-9_]+)|^from\s+([a-zA-Z0-9_]+)\s+import)''',
                re.MULTILINE,
            )),
            ("cargo", "rust", re.compile(
                r'''extern\s+crate\s+([a-zA-Z0-9_]+)|use\s+([a-zA-Z0-9_]+)::''',
            )),
        ]

        ext_to_lang: dict[str, str] = {
            ".js": "js_ts", ".ts": "js_ts", ".jsx": "js_ts", ".tsx": "js_ts",
            ".mjs": "js_ts", ".cjs": "js_ts",
            ".py": "python",
            ".rs": "rust",
        }

        for ext, lang, pattern in patterns:
            for file_path in path.rglob("*"):
                if ext_to_lang.get(file_path.suffix) != lang:
                    continue
                if any(skip in str(file_path) for skip in ["node_modules", ".git", "__pycache__", "dist", "build", ".venv", ".venv-claude"]):
                    continue
                try:
                    content = file_path.read_text(encoding="utf-8", errors="replace")
                except OSError:
                    continue

                for m in pattern.finditer(content):
                    pkg = next((g for g in m.groups() if g), None)
                    if not pkg or pkg.startswith("."):
                        continue
                    # Strip scoped package extra path
                    pkg = pkg.split("/")[0] + ("/" + pkg.split("/")[1] if pkg.startswith("@") and "/" in pkg else "")

                    line_no = content[:m.start()].count("\n") + 1
                    ai_score = _compute_ai_likelihood(
                        file_path=str(file_path),
                        pkg=pkg,
                        line_no=line_no,
                        content=content,
                        git_blame=git_blame_data,
                    )

                    records.append({
                        "file_path": str(file_path),
                        "ecosystem": ext if ext != "js_ts" else "npm",
                        "package": pkg,
                        "ref_type": "import",
                        "line_no": line_no,
                        "first_seen_commit": git_blame_data.get(str(file_path), {}).get(str(line_no), ""),
                        "ai_authored_likelihood": ai_score,
                    })

        return records


_REQUIREMENT_PIN = re.compile(r"^([A-Za-z0-9][A-Za-z0-9._-]*)\s*(?:\[[^\]]*\])?\s*==\s*([A-Za-z0-9._!+*-]+)")
_GEM_SPEC = re.compile(r"^    ([A-Za-z0-9_.-]+) \((\d[^\s)-]*)(?:-[A-Za-z][^)]*)?\)\s*$")


def _mark_direct_from_manifest(records: list[dict[str, Any]], path: Path) -> None:
    """pnpm and yarn lockfiles do not say which packages are direct; package.json does."""
    manifest = path / "package.json"
    if not manifest.is_file():
        return
    try:
        parsed = json.loads(manifest.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return
    sections = ("dependencies", "devDependencies", "optionalDependencies")
    direct = {n for sec in sections for n in (parsed.get(sec) or {})}
    for r in records:
        if r.get("ecosystem") == "npm" and r.get("package") in direct:
            r["declared_in"] = "direct"


def _finalise(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Canonical names, no version-less rows, and one row per (project, ecosystem, package, version).

    A project can hold several versions of one package, and a bad one must not hide behind a good one,
    so the version is part of the identity. A repeat of the same version keeps its 'direct' mark.
    """
    unique: dict[tuple[str, str, str, str], dict[str, Any]] = {}
    dropped = 0
    for r in records:
        name = normalize_package_name(r.get("ecosystem", ""), str(r.get("package", "")))
        version = str(r.get("version") or "").strip()
        if not name or not version:
            dropped += 1  # workspace links and VCS entries name no registry version
            continue
        r["package"], r["version"] = name, version
        key = (r.get("project_path", ""), r["ecosystem"], name, version)
        kept = unique.get(key)
        if kept is None:
            unique[key] = r
        elif r.get("declared_in") == "direct":
            kept["declared_in"] = "direct"
    if dropped:
        log.info("lockfile.skipped_entries", count=dropped)
    return list(unique.values())


def _extract_parent_chain(pkg_path: str) -> list[str]:
    """node_modules/a/node_modules/b → ['a']"""
    parts = pkg_path.split("/node_modules/")
    if len(parts) <= 2:
        return []
    return [p.split("/")[0] for p in parts[1:-1]]


def _parse_pnpm_key(key: str) -> tuple[str, str]:
    """Parse pnpm lock key like '/lodash/4.17.21' or 'lodash@4.17.21'."""
    if key.startswith("/"):
        parts = key.lstrip("/").rsplit("/", 1)
        return (parts[0], parts[1]) if len(parts) == 2 else (key, "")
    if "@" in key.lstrip("@"):
        idx = key.lstrip("@").index("@")
        actual_idx = idx + (1 if key.startswith("@") else 0)
        return key[:actual_idx], key[actual_idx + 1:]
    return key, ""


def _load_git_blame_data(path: Path) -> dict[str, dict[str, str]]:
    """
    Return {file_path: {line_no_str: commit_sha}} using gitpython.

    Also returns a special "_commit_messages" key mapping sha → message
    so the AI-likelihood scorer can detect LLM commit patterns.
    """
    try:
        import git
        repo = git.Repo(path, search_parent_directories=True)
    except Exception:
        return {}

    result: dict[str, dict[str, str]] = {"_commit_messages": {}}
    # Cap to source files to avoid excessive I/O
    source_exts = {".js", ".ts", ".jsx", ".tsx", ".mjs", ".py", ".rs"}
    files_checked = 0

    for file_path in path.rglob("*"):
        if file_path.suffix not in source_exts:
            continue
        if any(skip in str(file_path) for skip in ["node_modules", ".git", "__pycache__", "dist", "build", ".venv", ".venv-claude"]):
            continue
        if files_checked >= 30:
            break
        files_checked += 1
        try:
            blame = repo.blame("HEAD", str(file_path.relative_to(repo.working_dir)))
            line_map: dict[str, str] = {}
            line_no = 1
            for commit, lines in blame:
                sha = commit.hexsha[:12]
                msg = commit.message.strip()[:200]
                result["_commit_messages"][sha] = msg
                for _ in lines:
                    line_map[str(line_no)] = sha
                    line_no += 1
            result[str(file_path)] = line_map
        except Exception:
            continue

    return result


def _compute_ai_likelihood(
    file_path: str,
    pkg: str,
    line_no: int,
    content: str,
    git_blame: dict[str, dict[str, str]],
) -> float:
    """
    Heuristic AI-authored likelihood for an import statement.

    Based on:
    - Commit message patterns (LLM style — "Add support for X", "Implement X")
    - Claude Code / Copilot identity in commit messages
    - No accompanying test file change
    - Bulk-added imports (many new imports in one commit)
    - Package name matches LLM hallucination patterns
    """
    score = 0.0

    # Heuristic 1: file has many single-use packages (>20 imports)
    import_count = content.count("import ") + content.count("require(")
    if import_count > 20:
        score += 0.15

    # Heuristic 2: package name matches common hallucination patterns
    _hallucination_patterns = [
        r"^react-[a-z]+-(?:helper|utils|sdk|tool|lib)$",
        r"^(?:lodash|express|axios)-[a-z]+$",
        r"^[a-z]+-(?:helper|utils|sdk|cli|tool|lib)-[a-z]+$",
    ]
    for pat in _hallucination_patterns:
        if re.match(pat, pkg):
            score += 0.25
            break

    # Heuristic 3: file has no corresponding test file nearby
    test_file = Path(file_path).parent / (Path(file_path).stem + ".test" + Path(file_path).suffix)
    spec_file = Path(file_path).parent / (Path(file_path).stem + ".spec" + Path(file_path).suffix)
    if not test_file.exists() and not spec_file.exists():
        score += 0.1

    # Heuristic 4: long lines / verbose variable names (LLM code style)
    lines = content.split("\n")
    avg_line_length = sum(len(l) for l in lines) / max(len(lines), 1)
    if avg_line_length > 80:
        score += 0.1

    # Heuristic 5: git blame — check commit message that introduced this import
    # LLM agents produce characteristic commit message patterns
    file_blame = git_blame.get(file_path, {})
    commit_messages = git_blame.get("_commit_messages", {})
    if file_blame and commit_messages:
        sha = file_blame.get(str(line_no), "")
        if sha:
            msg = commit_messages.get(sha, "").lower()
            # Classic LLM commit patterns
            llm_patterns = [
                r"^add support for",
                r"^implement ",
                r"^add \w+ (functionality|feature|support|integration)",
                r"^create \w+ (component|service|handler|module)",
                r"^update \w+ to (use|support|include)",
                r"co-authored-by:.*copilot",
                r"co-authored-by:.*claude",
                r"generated (by|with) (claude|copilot|gpt|cursor|aider)",
                r"🤖",  # bot emoji common in AI commit messages
            ]
            for pat in llm_patterns:
                if re.search(pat, msg):
                    score += 0.30
                    break

            # No-test-change signal: if the commit touched only this file
            # (can't check cheaply here — proxy with message length)
            if len(msg) < 30 and msg:
                # Very short messages are common in vibe-coded commits
                score += 0.05

    return min(score, 0.95)

