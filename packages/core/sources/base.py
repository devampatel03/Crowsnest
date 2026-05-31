"""Abstract base class for all Crowsnest data source adapters."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, AsyncIterator


class DataSource(ABC):
    """
    Base class for all Crowsnest data source adapters.

    Each adapter fetches from one external source (npm registry, GitHub API,
    OSV.dev, etc.) and returns records shaped for a specific CoralDB table.
    """

    name: str = "base"
    tables: list[str] = []   # which CoralDB tables this source populates

    @abstractmethod
    async def fetch(self, **kwargs: Any) -> list[dict[str, Any]]:
        """Fetch records from this source. Returns list of dicts matching table schema."""

    async def stream(self, **kwargs: Any) -> AsyncIterator[dict[str, Any]]:
        """Stream records (default: one-shot fetch, not truly streaming)."""
        for record in await self.fetch(**kwargs):
            yield record

    def validate_record(self, table: str, record: dict[str, Any]) -> dict[str, Any]:
        """Strip unknown fields and fill None for expected fields."""
        return {k: v for k, v in record.items() if v is not None}
