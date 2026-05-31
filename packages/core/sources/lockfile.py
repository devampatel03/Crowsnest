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

        for lockfile_name, parser in [
            ("package-lock.json", self.parse_package_lock),
            ("pnpm-lock.yaml", self.parse_pnpm_lock),
            ("yarn.lock", self.parse_yarn_lock),
            ("poetry.lock", self.parse_poetry_lock),
            ("Cargo.lock", self.parse_cargo_lock),
            ("go.sum", self.parse_go_sum),
        ]:
            lockfile_path = path / lockfile_name
            if lockfile_path.exists():
                try:
                    parsed = parser(str(lockfile_path))
                    for r in parsed:
                        r["project_path"] = str(path)
                    records.extend(parsed)
                    log.info("lockfile.parsed", file=lockfile_name, count=len(parsed))
                except Exception as exc:
                    log.error("lockfile.parse_error", file=lockfile_name, error=str(exc))

        return records

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
        """Parse yarn.lock (classic v1 format)."""
        records = []
        current_pkg: dict[str, Any] = {}

        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.rstrip()
                if not line or line.startswith("#"):
                    continue
                if not line.startswith(" "):
                    # Package header: '"@org/pkg@^1.0.0":'
                    if current_pkg.get("package"):
                        records.append(current_pkg)
                    name_match = re.match(r'"?(@?[^@"]+)@', line)
                    current_pkg = {"package": name_match.group(1) if name_match else "",
                                   "ecosystem": "npm", "declared_in": "transitive",
                                   "parent_chain": [], "integrity_hash": "",
                                   "resolved_url": "", "version": ""}
                elif "version" in line:
                    v_match = re.search(r'version "([^"]+)"', line)
                    if v_match:
                        current_pkg["version"] = v_match.group(1)
                elif "resolved" in line:
                    r_match = re.search(r'resolved "([^"]+)"', line)
                    if r_match:
                        current_pkg["resolved_url"] = r_match.group(1)
                elif "integrity" in line:
                    i_match = re.search(r'integrity (sha\S+)', line)
                    if i_match:
                        current_pkg["integrity_hash"] = i_match.group(1)

        if current_pkg.get("package"):
            records.append(current_pkg)
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
        for match in re.finditer(r'\[\[package\]\]\nname = "([^"]+)"\nversion = "([^"]+)"', content):
            records.append({
                "ecosystem": "pypi",
                "package": match.group(1),
                "version": match.group(2),
                "integrity_hash": "", "resolved_url": "",
                "declared_in": "transitive", "parent_chain": [],
            })
        return records

    def parse_cargo_lock(self, path: str) -> list[dict[str, Any]]:
        if tomllib is None:
            return []

        with open(path, "rb") as f:
            data = tomllib.load(f)

        records = []
        for pkg in data.get("package", []):
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
                    version = parts[1].rstrip("/go.mod")
                    integrity = parts[2]
                    if "/go.mod" in parts[1]:
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


# ── helpers ────────────────────────────────────────────────────────────────


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

