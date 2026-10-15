"""The one interface every model provider implements. Agents depend on this, never on a vendor SDK."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Protocol


class LLMError(RuntimeError):
    """A model call failed. The message is written for the person running Crowsnest, not for a stack trace."""


@dataclass(frozen=True)
class LLMResponse:
    text: str
    input_tokens: int = 0
    output_tokens: int = 0

    @property
    def total_tokens(self) -> int:
        return self.input_tokens + self.output_tokens


class LLMClient(Protocol):
    """Send one system prompt and one user message, get text back."""

    provider: str
    model: str

    async def complete(self, *, system: str, user: str, max_tokens: int = 1024) -> LLMResponse: ...


def extract_json(text: str, want: tuple[type, ...] = (list, dict)) -> Any:
    """
    Pull the first JSON value of a wanted type out of a model reply.

    Models wrap JSON in code fences or chatty prose, and smaller or local ones do it more often. This finds the
    first decodable array or object instead of insisting the whole reply parses. Raises ValueError if none.
    """
    decoder = json.JSONDecoder()
    i = 0
    while i < len(text):
        if text[i] not in "[{":
            i += 1
            continue
        try:
            value, end = decoder.raw_decode(text, i)
        except ValueError:
            i += 1
            continue
        if isinstance(value, want):
            return value
        i = end  # a complete value of the wrong type: do not dig arrays out of the inside of it
    raise ValueError("no JSON value found in the model reply")
