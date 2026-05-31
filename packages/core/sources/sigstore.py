"""
Sigstore Rekor transparency log adapter.

Fetches build attestations and SLSA provenance records.
"""

from __future__ import annotations

import base64
import json
from datetime import datetime, timezone
from typing import Any

import httpx
import structlog

from .base import DataSource

log = structlog.get_logger(__name__)

_REKOR_API = "https://rekor.sigstore.dev/api/v1"


class SigstoreRekorSource(DataSource):
    name = "sigstore_rekor"
    tables = ["sigstore_rekor"]

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            headers={"User-Agent": "crowsnest/0.1 (supply-chain-security)"},
            timeout=httpx.Timeout(30.0, read=60.0),
        )

    async def fetch(self, subject_hash: str = "", **kwargs: Any) -> list[dict[str, Any]]:
        if subject_hash:
            return await self.fetch_by_subject(subject_hash)
        return []

    async def fetch_by_subject(self, subject_hash: str) -> list[dict[str, Any]]:
        """Find Rekor entries for an artifact by its SHA256 hash."""
        try:
            async with self._client() as client:
                # Search the transparency log index for the hash
                resp = await client.post(
                    f"{_REKOR_API}/index/retrieve",
                    json={"hash": f"sha256:{subject_hash}"},
                )
                if resp.status_code == 404:
                    return []
                resp.raise_for_status()
                uuids: list[str] = resp.json()
        except httpx.HTTPError as exc:
            log.error("sigstore.index_error", hash=subject_hash, error=str(exc))
            return []

        records = []
        async with self._client() as client:
            for uuid in uuids[:10]:  # cap to avoid excessive requests
                entry = await self._fetch_entry(client, uuid)
                if entry:
                    records.append(entry)
        return records

    async def _fetch_entry(
        self,
        client: httpx.AsyncClient,
        uuid: str,
    ) -> dict[str, Any] | None:
        try:
            resp = await client.get(f"{_REKOR_API}/log/entries/{uuid}")
            if resp.status_code == 404:
                return None
            resp.raise_for_status()
            data = resp.json()
        except httpx.HTTPError as exc:
            log.error("sigstore.entry_error", uuid=uuid, error=str(exc))
            return None

        # Rekor entry is keyed by UUID
        entry_data = list(data.values())[0] if data else {}
        body_b64 = entry_data.get("body", "")
        try:
            body = json.loads(base64.b64decode(body_b64).decode())
        except Exception:
            body = {}

        integrated_time = entry_data.get("integratedTime", 0)
        spec = body.get("spec", {})

        # Extract subject (varies by entry type: hashedrekord, dsse, etc.)
        subject = _extract_subject(spec, body.get("kind", ""))
        build_invocation_id = _extract_build_invocation_id(spec)
        predicate = _extract_predicate(spec)

        return {
            "log_index": entry_data.get("logIndex", 0),
            "integrated_time": datetime.fromtimestamp(integrated_time, tz=timezone.utc) if integrated_time else None,
            "subject": subject,
            "public_key": _extract_public_key(spec),
            "x509_chain": None,
            "build_config_uri": predicate.get("buildConfig", {}).get("uri", "") if predicate else "",
            "build_invocation_id": build_invocation_id,
            "attested_predicate": json.dumps(predicate) if predicate else None,
        }

    async def fetch_recent(self, limit: int = 100) -> list[dict[str, Any]]:
        """Fetch the most recent entries from the Rekor log."""
        try:
            async with self._client() as client:
                resp = await client.get(f"{_REKOR_API}/log")
                resp.raise_for_status()
                log_info = resp.json()
                tree_size = log_info.get("treeSize", 0)

            if tree_size == 0:
                return []

            # Fetch last `limit` entries by index range
            start = max(0, tree_size - limit)
            entries = []
            async with self._client() as client:
                for idx in range(start, tree_size, 10):
                    resp = await client.get(
                        f"{_REKOR_API}/log/entries",
                        params={"logIndex": idx},
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        for _uuid, entry in data.items():
                            entries.append({"log_index": idx, **entry})
            return entries[:limit]

        except httpx.HTTPError as exc:
            log.error("sigstore.recent_error", error=str(exc))
            return []


# ── parsing helpers ────────────────────────────────────────────────────────


def _extract_subject(spec: dict[str, Any], kind: str) -> str:
    if kind == "hashedrekord":
        return spec.get("data", {}).get("hash", {}).get("value", "")
    if kind in ("dsse", "intoto"):
        payload = spec.get("envelope", {}).get("payload", "")
        try:
            decoded = json.loads(base64.b64decode(payload).decode())
            subjects = decoded.get("subject", [])
            if subjects:
                return subjects[0].get("name", "")
        except Exception:
            pass
    return ""


def _extract_build_invocation_id(spec: dict[str, Any]) -> str:
    payload = spec.get("envelope", {}).get("payload", "")
    try:
        decoded = json.loads(base64.b64decode(payload).decode())
        pred = decoded.get("predicate", {})
        # SLSA 0.2
        run_details = pred.get("runDetails", pred.get("buildInvocation", {}))
        return (
            run_details.get("builder", {}).get("id", "")
            or pred.get("metadata", {}).get("buildInvocationID", "")
        )
    except Exception:
        return ""


def _extract_predicate(spec: dict[str, Any]) -> dict[str, Any] | None:
    payload = spec.get("envelope", {}).get("payload", "")
    try:
        decoded = json.loads(base64.b64decode(payload).decode())
        return decoded.get("predicate")
    except Exception:
        return None


def _extract_public_key(spec: dict[str, Any]) -> str:
    sig = spec.get("signature", {})
    return sig.get("publicKey", {}).get("content", "")
