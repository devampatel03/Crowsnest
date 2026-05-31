"""
GitHub API adapter.

Fetches repos, commits, releases, Actions runs/workflows, and permission audit logs.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import re
import time
from datetime import datetime, timezone
from typing import Any

import httpx
import structlog

from .base import DataSource

log = structlog.get_logger(__name__)

_GH_API = "https://api.github.com"


class GitHubSource(DataSource):
    name = "github"
    tables = [
        "gh_repos", "gh_commits", "gh_releases",
        "gh_actions_runs", "gh_workflow_files", "gh_repo_perms_audit",
    ]

    def __init__(self, token: str = ""):
        self._token = token
        self._semaphore = asyncio.Semaphore(5)  # GitHub rate limit friendly

    def _client(self) -> httpx.AsyncClient:
        headers = {
            "User-Agent": "crowsnest/0.1 (supply-chain-security)",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        if self._token:
            headers["Authorization"] = f"Bearer {self._token}"
        return httpx.AsyncClient(headers=headers, timeout=httpx.Timeout(30.0, read=60.0))

    async def _get(
        self,
        client: httpx.AsyncClient,
        path: str,
        params: dict[str, Any] | None = None,
    ) -> Any:
        async with self._semaphore:
            for attempt in range(3):
                try:
                    resp = await client.get(f"{_GH_API}{path}", params=params)
                    # Handle rate limiting
                    if resp.status_code == 429 or (
                        resp.status_code == 403 and "rate limit" in resp.text.lower()
                    ):
                        reset = int(resp.headers.get("X-RateLimit-Reset", time.time() + 60))
                        sleep_sec = max(1, reset - int(time.time()))
                        log.warning("github.rate_limited", sleep=sleep_sec)
                        await asyncio.sleep(min(sleep_sec, 60))
                        continue
                    if resp.status_code == 404:
                        return None
                    resp.raise_for_status()
                    return resp.json()
                except httpx.HTTPError as exc:
                    if attempt == 2:
                        log.error("github.request_failed", path=path, error=str(exc))
                        return None
                    await asyncio.sleep(2 ** attempt)
        return None

    async def _paginate(
        self,
        client: httpx.AsyncClient,
        path: str,
        params: dict[str, Any] | None = None,
        max_pages: int = 10,
    ) -> list[Any]:
        results = []
        p = dict(params or {})
        p.setdefault("per_page", 100)
        page = 1
        while page <= max_pages:
            p["page"] = page
            data = await self._get(client, path, p)
            if not data:
                break
            if isinstance(data, list):
                results.extend(data)
                if len(data) < p["per_page"]:
                    break
            else:
                results.append(data)
                break
            page += 1
        return results

    async def fetch(self, org: str = "", repo: str = "", **kwargs: Any) -> list[dict[str, Any]]:
        if org and repo:
            return await self.fetch_repo_full(org, repo)
        return []

    async def fetch_repo(self, org: str, repo: str) -> dict[str, Any] | None:
        async with self._client() as client:
            data = await self._get(client, f"/repos/{org}/{repo}")
        if not data:
            return None
        return {
            "org": org,
            "repo_name": repo,
            "default_branch": data.get("default_branch", "main"),
            "visibility": data.get("visibility", "private"),
            "created_at": _parse_ts(data.get("created_at")),
            "archived": data.get("archived", False),
        }

    async def fetch_commits(self, org: str, repo: str, since_days: int = 90) -> list[dict[str, Any]]:
        from datetime import timedelta
        since = (datetime.now(timezone.utc) - timedelta(days=since_days)).isoformat()

        async with self._client() as client:
            raw = await self._paginate(
                client,
                f"/repos/{org}/{repo}/commits",
                {"since": since},
                max_pages=5,
            )

        commits = []
        for c in raw:
            commit_data = c.get("commit", {})
            author = commit_data.get("author", {})
            committer = commit_data.get("committer", {})

            commits.append({
                "repo": f"{org}/{repo}",
                "sha": c.get("sha", ""),
                "author_email": author.get("email", ""),
                "author_login": (c.get("author") or {}).get("login", author.get("name", "")),
                "committer_login": (c.get("committer") or {}).get("login", committer.get("name", "")),
                "ts": _parse_ts(author.get("date")),
                "files_changed": [],  # expensive — skipped for bulk fetch
                "gpg_verified": c.get("commit", {}).get("verification", {}).get("verified", False),
                "signed_by": c.get("commit", {}).get("verification", {}).get("signer", ""),
                "is_merge": len(c.get("parents", [])) > 1,
                "parent_count": len(c.get("parents", [])),
                "message": commit_data.get("message", "")[:500],
            })
        return commits

    async def fetch_releases(self, org: str, repo: str) -> list[dict[str, Any]]:
        async with self._client() as client:
            raw = await self._paginate(client, f"/repos/{org}/{repo}/releases")

        releases = []
        for r in raw:
            releases.append({
                "repo": f"{org}/{repo}",
                "tag": r.get("tag_name", ""),
                "release_ts": _parse_ts(r.get("published_at")),
                "author_login": (r.get("author") or {}).get("login", ""),
                "attestation_url": None,
                "asset_urls": [a.get("browser_download_url", "") for a in r.get("assets", [])],
            })
        return releases

    async def fetch_actions_runs(self, org: str, repo: str, days: int = 30) -> list[dict[str, Any]]:
        async with self._client() as client:
            raw = await self._paginate(
                client,
                f"/repos/{org}/{repo}/actions/runs",
                {"per_page": 100},
                max_pages=3,
            )

        runs = []
        for r in raw:
            runs.append({
                "repo": f"{org}/{repo}",
                "workflow": r.get("path", r.get("workflow_id", "")),
                "run_id": str(r.get("id", "")),
                "started_at": _parse_ts(r.get("run_started_at")),
                "finished_at": _parse_ts(r.get("updated_at")),
                "conclusion": r.get("conclusion", ""),
                "runner_label": (r.get("runner_labels") or [{}])[0].get("name", ""),
                "triggered_by": r.get("event", ""),
                "oidc_audience": None,   # not exposed in API directly
                "oidc_subject": None,
            })
        return runs

    async def fetch_workflow_files(self, org: str, repo: str) -> list[dict[str, Any]]:
        async with self._client() as client:
            # List workflow files
            tree_data = await self._get(
                client,
                f"/repos/{org}/{repo}/contents/.github/workflows",
            )
            if not tree_data or not isinstance(tree_data, list):
                return []

            files = []
            for item in tree_data:
                if not item.get("name", "").endswith((".yml", ".yaml")):
                    continue
                file_data = await self._get(client, f"/repos/{org}/{repo}/contents/{item['path']}")
                if not file_data:
                    continue
                content_b64 = file_data.get("content", "")
                try:
                    content = base64.b64decode(content_b64).decode("utf-8", errors="replace")
                except Exception:
                    content = ""

                files.append({
                    "repo": f"{org}/{repo}",
                    "path": item["path"],
                    "ref": "HEAD",
                    "content_hash": hashlib.sha256(content.encode()).hexdigest(),
                    "declared_actions": _extract_actions(content),
                    "permissions": _extract_permissions(content),
                    "has_pwn_request_pattern": _has_pwn_request_pattern(content),
                })

        return files

    async def fetch_org_repos(self, org: str) -> list[dict[str, Any]]:
        async with self._client() as client:
            raw = await self._paginate(client, f"/orgs/{org}/repos", max_pages=20)

        return [
            {
                "org": org,
                "repo_name": r.get("name", ""),
                "default_branch": r.get("default_branch", "main"),
                "visibility": r.get("visibility", "private"),
                "created_at": _parse_ts(r.get("created_at")),
                "archived": r.get("archived", False),
            }
            for r in raw
        ]

    async def fetch_repo_full(self, org: str, repo: str) -> list[dict[str, Any]]:
        """Fetch all tables for a single repo and return combined records."""
        records: list[dict[str, Any]] = []

        repo_data = await self.fetch_repo(org, repo)
        if repo_data:
            records.append({"_table": "gh_repos", **repo_data})

        commits = await self.fetch_commits(org, repo)
        records.extend({"_table": "gh_commits", **c} for c in commits)

        releases = await self.fetch_releases(org, repo)
        records.extend({"_table": "gh_releases", **r} for r in releases)

        runs = await self.fetch_actions_runs(org, repo)
        records.extend({"_table": "gh_actions_runs", **r} for r in runs)

        workflows = await self.fetch_workflow_files(org, repo)
        records.extend({"_table": "gh_workflow_files", **w} for w in workflows)

        return records


# ── helpers ────────────────────────────────────────────────────────────────


def _parse_ts(val: str | None) -> datetime | None:
    if not val:
        return None
    try:
        return datetime.fromisoformat(val.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None


def _extract_actions(content: str) -> list[str]:
    """Extract 'uses: owner/action@version' from workflow YAML."""
    return re.findall(r"uses:\s+([a-zA-Z0-9_\-./]+@[^\s]+)", content)


def _extract_permissions(content: str) -> str:
    """Extract top-level permissions block as a compact string."""
    match = re.search(r"permissions:\s*\n((?:\s+\w+:.*\n)+)", content)
    return match.group(0).strip() if match else ""


def _has_pwn_request_pattern(content: str) -> bool:
    """
    Detect the classic pwn-request pattern:
    pull_request_target trigger + checkout of PR head + write permissions.
    """
    has_prt = "pull_request_target" in content
    has_checkout_head = bool(
        re.search(r"ref:\s*\$\{\{\s*github\.event\.pull_request\.head\.sha\s*\}\}", content)
        or re.search(r"ref:\s*\$\{\{\s*github\.head_ref\s*\}\}", content)
    )
    has_write = bool(re.search(r"(contents|packages|id-token):\s*write", content))
    return has_prt and (has_checkout_head or has_write)
