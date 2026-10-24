"""
Registry adapters for crates.io, Packagist, RubyGems and the Go module proxy.

Each one fills `registry_packages` and `registry_versions`, the tables behind the neutral `packages` and
`package_versions` views. Download counts a registry does not report stay NULL rather than 0, so "few downloads"
rules cannot fire on missing data.
"""

from __future__ import annotations

import asyncio
import re
from datetime import UTC, datetime
from typing import Any
from urllib.parse import quote

import httpx
import structlog

from ..ecosystems import CARGO, COMPOSER, GO, RUBYGEMS, normalize_package_name
from .base import DataSource

log = structlog.get_logger(__name__)

_USER_AGENT = "crowsnest/0.1 (supply-chain-security)"
_GO_VERSIONS_KEPT = 50


class RegistryAdapter(DataSource):
    """Shared HTTP behaviour: one client per adapter, bounded concurrency, errors become 'not found'."""

    ecosystem = ""
    tables = ["registry_packages", "registry_versions"]

    def __init__(self, transport: httpx.AsyncBaseTransport | None = None, concurrency: int = 5):
        self._transport = transport
        self._semaphore = asyncio.Semaphore(concurrency)

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            headers={"User-Agent": _USER_AGENT},
            timeout=httpx.Timeout(30.0),
            follow_redirects=True,
            transport=self._transport,
        )

    async def _get(self, client: httpx.AsyncClient, url: str) -> Any | None:
        """JSON body, or None for a missing package or a failed request (logged, never raised)."""
        async with self._semaphore:
            try:
                resp = await client.get(url)
                if resp.status_code == 404:
                    return None
                resp.raise_for_status()
                return resp.json()
            except (httpx.HTTPError, ValueError) as exc:
                log.warning("registry.fetch_error", ecosystem=self.ecosystem, url=url, error=str(exc))
                return None

    async def fetch(self, package: str = "", **kwargs: Any) -> list[dict[str, Any]]:
        if not package:
            return []
        async with self._client() as client:
            return await self._fetch_package(client, package)

    async def _fetch_package(self, client: httpx.AsyncClient, name: str) -> list[dict[str, Any]]:
        raise NotImplementedError

    def _package_record(self, **fields: Any) -> dict[str, Any]:
        return {"_table": "registry_packages", "ecosystem": self.ecosystem, **fields}

    def _version_record(self, name: str, version: str, published_at: datetime | None,
                        published_by: str = "") -> dict[str, Any]:
        return {
            "_table": "registry_versions", "ecosystem": self.ecosystem, "name": name,
            "version": version, "published_at": published_at, "published_by": published_by,
        }


class CratesIoSource(RegistryAdapter):
    name = "crates_io"
    ecosystem = CARGO

    async def _fetch_package(self, client: httpx.AsyncClient, name: str) -> list[dict[str, Any]]:
        data = await self._get(client, f"https://crates.io/api/v1/crates/{quote(name, safe='')}")
        if not data or not isinstance(data.get("crate"), dict):
            return []
        crate = data["crate"]
        versions = [v for v in data.get("versions", []) if isinstance(v, dict) and v.get("num")]
        publishers = sorted({
            (v.get("published_by") or {}).get("login", "") for v in versions
        } - {""})
        recent = crate.get("recent_downloads")
        records = [self._package_record(
            name=name,
            latest_version=crate.get("max_stable_version") or crate.get("max_version") or "",
            # crates.io reports the last 90 days; a week is a thirteenth of that.
            weekly_downloads=round(recent / 13) if isinstance(recent, int) else None,
            repo_url=crate.get("repository") or "",
            license=(versions[0].get("license") if versions else "") or "",
            maintainers=publishers,
            created_at=parse_ts(crate.get("created_at")),
            updated_at=parse_ts(crate.get("updated_at")),
        )]
        for v in versions:
            records.append(self._version_record(
                name, v["num"], parse_ts(v.get("created_at")), (v.get("published_by") or {}).get("login", ""),
            ))
        return records


class PackagistSource(RegistryAdapter):
    name = "packagist"
    ecosystem = COMPOSER

    async def _fetch_package(self, client: httpx.AsyncClient, name: str) -> list[dict[str, Any]]:
        name = normalize_package_name(COMPOSER, name)
        data = await self._get(client, f"https://packagist.org/packages/{quote(name, safe='/')}.json")
        pkg = (data or {}).get("package")
        if not isinstance(pkg, dict):
            return []
        releases = {
            ver: info for ver, info in (pkg.get("versions") or {}).items()
            if isinstance(info, dict) and not ver.startswith("dev-") and not ver.endswith("-dev")
        }
        times = [t for t in (parse_ts(i.get("time")) for i in releases.values()) if t]
        monthly = (pkg.get("downloads") or {}).get("monthly")
        dated = [(t, v) for v, i in releases.items() if (t := parse_ts(i.get("time")))]
        latest = max(dated)[1] if dated else ""
        records = [self._package_record(
            name=name,
            latest_version=latest,
            weekly_downloads=round(monthly / 4.3) if isinstance(monthly, int) else None,
            repo_url=pkg.get("repository") or "",
            license="",
            maintainers=[m.get("name", "") for m in pkg.get("maintainers", []) if isinstance(m, dict)],
            created_at=min(times) if times else None,
            updated_at=max(times) if times else None,
        )]
        for ver, info in releases.items():
            records.append(self._version_record(name, ver, parse_ts(info.get("time"))))
        return records


class RubyGemsSource(RegistryAdapter):
    name = "rubygems"
    ecosystem = RUBYGEMS

    async def _fetch_package(self, client: httpx.AsyncClient, name: str) -> list[dict[str, Any]]:
        base = f"https://rubygems.org/api/v1/gems/{quote(name, safe='')}"
        gem = await self._get(client, base + ".json")
        if not isinstance(gem, dict):
            return []
        versions = await self._get(client, f"https://rubygems.org/api/v1/versions/{quote(name, safe='')}.json")
        owners = await self._get(client, base + "/owners.json")
        versions = [v for v in (versions or []) if isinstance(v, dict) and v.get("number")]
        times = [t for t in (parse_ts(v.get("created_at")) for v in versions) if t]
        records = [self._package_record(
            name=name,
            latest_version=gem.get("version") or "",
            weekly_downloads=None,  # RubyGems only reports lifetime downloads
            repo_url=gem.get("source_code_uri") or gem.get("homepage_uri") or "",
            license=", ".join(gem.get("licenses") or []),
            maintainers=[o.get("handle", "") for o in (owners or []) if isinstance(o, dict)],
            created_at=min(times) if times else None,
            updated_at=max(times) if times else None,
        )]
        seen: set[str] = set()
        for v in versions:
            # One row per version number: platform variants share it.
            if v["number"] in seen:
                continue
            seen.add(v["number"])
            records.append(self._version_record(name, v["number"], parse_ts(v.get("created_at"))))
        return records


class GoProxySource(RegistryAdapter):
    name = "go_proxy"
    ecosystem = GO

    async def _fetch_package(self, client: httpx.AsyncClient, name: str) -> list[dict[str, Any]]:
        base = f"https://proxy.golang.org/{escape_go_module(name)}/@v"
        async with self._semaphore:
            try:
                resp = await client.get(f"{base}/list")
                if resp.status_code in (404, 410):
                    return []
                resp.raise_for_status()
                listed = [v for v in resp.text.split() if v]
            except httpx.HTTPError as exc:
                log.warning("registry.fetch_error", ecosystem=GO, url=f"{base}/list", error=str(exc))
                return []
        latest = await self._get(client, f"https://proxy.golang.org/{escape_go_module(name)}/@latest")
        wanted = sorted(listed, key=_semver_key)[-_GO_VERSIONS_KEPT:]
        infos = await asyncio.gather(*[self._get(client, f"{base}/{quote(v, safe='')}.info") for v in wanted])
        versions = [(v, parse_ts((i or {}).get("Time"))) for v, i in zip(wanted, infos, strict=True)]
        times = [t for _, t in versions if t]
        records = [self._package_record(
            name=name,
            latest_version=(latest or {}).get("Version") or (wanted[-1] if wanted else ""),
            weekly_downloads=None,  # the proxy publishes no download counts
            repo_url=f"https://{name}" if name.split("/", 1)[0] == "github.com" else "",
            license="",
            maintainers=[],
            created_at=min(times) if times else None,
            updated_at=max(times) if times else None,
        )]
        records += [self._version_record(name, v, t) for v, t in versions]
        return records


def escape_go_module(path: str) -> str:
    """Go proxy path rule: each uppercase letter becomes '!' plus its lowercase."""
    return re.sub(r"[A-Z]", lambda m: "!" + m.group(0).lower(), path)


def _semver_key(version: str) -> tuple[Any, ...]:
    """Sort key for Go versions such as v1.2.3 and v1.2.3-rc.1 (a release sorts after its pre-releases)."""
    core, _, pre = version.lstrip("v").partition("-")
    nums = tuple(int(p) if p.isdigit() else 0 for p in re.split(r"[.+]", core)[:3])
    return (*nums, 0 if pre else 1, pre)


def parse_ts(val: str | None) -> datetime | None:
    """ISO timestamp as a naive UTC datetime (the engine stores TIMESTAMP without a zone)."""
    if not val:
        return None
    try:
        parsed = datetime.fromisoformat(val.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(UTC).replace(tzinfo=None)
    return parsed


REGISTRY_SOURCES: dict[str, type[RegistryAdapter]] = {
    CARGO: CratesIoSource,
    COMPOSER: PackagistSource,
    RUBYGEMS: RubyGemsSource,
    GO: GoProxySource,
}
