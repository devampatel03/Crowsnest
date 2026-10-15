"""Work out which model to use from the environment and .env, with as little to set as possible."""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

from dotenv import dotenv_values

from .base import LLMClient, LLMError
from .providers import AUTO_DETECT_ORDER, PRESETS, AnthropicClient, OpenAICompatClient, Preset

ENV_PROVIDER = "CROWSNEST_LLM_PROVIDER"
ENV_MODEL = "CROWSNEST_LLM_MODEL"
ENV_BASE_URL = "CROWSNEST_LLM_BASE_URL"
ENV_API_KEY = "CROWSNEST_LLM_API_KEY"


def load_env(env_file: str | Path = ".env") -> dict[str, str]:
    """.env first, real environment variables on top (so they win), blanks dropped."""
    merged: dict[str, str | None] = {**dotenv_values(env_file), **os.environ}
    return {k: v.strip() for k, v in merged.items() if v and v.strip()}


@dataclass(frozen=True)
class LLMSettings:
    provider: str
    model: str
    base_url: str
    api_key: str
    preset: Preset
    auto_detected: bool = False


def resolve_settings(env: Mapping[str, str]) -> LLMSettings | None:
    """
    The model to use, or None when none is configured (Crowsnest then runs on its fixed rules, which is a supported mode).

    Rules: name a provider with CROWSNEST_LLM_PROVIDER, or just set that provider's usual key (ANTHROPIC_API_KEY,
    OPENAI_API_KEY, ...) and it is found. CROWSNEST_LLM_API_KEY works for any provider. Raises LLMError for an unknown
    provider name, because silently ignoring a typo would hide it.
    """
    name = env.get(ENV_PROVIDER, "").lower()
    auto = False
    if not name:
        name = next((n for n in AUTO_DETECT_ORDER if env.get(PRESETS[n].key_env)), "")
        if not name and env.get(ENV_API_KEY):
            raise LLMError(f"{ENV_API_KEY} is set but no provider is named. Also set {ENV_PROVIDER} (one of: {', '.join(PRESETS)}).")
        auto = bool(name)
    if not name:
        return None
    preset = PRESETS.get(name)
    if preset is None:
        raise LLMError(f"Unknown provider '{name}'. Choose one of: {', '.join(PRESETS)}.")

    key = env.get(ENV_API_KEY, "") or (env.get(preset.key_env, "") if preset.key_env else "")
    if preset.key_env and not key and name != "custom":
        raise LLMError(f"{preset.label} needs a key. Set {preset.key_env} (get one at {preset.key_url}).")
    return LLMSettings(
        provider=name,
        model=env.get(ENV_MODEL, "") or preset.default_model,
        base_url=env.get(ENV_BASE_URL, "") or preset.base_url,
        api_key=key,
        preset=preset,
        auto_detected=auto,
    )


def build_client(settings: LLMSettings) -> LLMClient:
    if settings.preset.kind == "anthropic":
        return AnthropicClient(settings.api_key, settings.model, settings.base_url)
    return OpenAICompatClient(settings.provider, settings.base_url, settings.api_key, settings.model)


def get_llm(env: Mapping[str, str] | None = None) -> LLMClient | None:
    """The configured client, or None for rules-only mode. A bad configuration is logged, not fatal."""
    import structlog

    try:
        settings = resolve_settings(load_env() if env is None else env)
        return build_client(settings) if settings else None
    except LLMError as exc:
        structlog.get_logger(__name__).warning("llm.misconfigured", error=str(exc))
        return None


def describe(env: Mapping[str, str] | None = None) -> dict[str, object]:
    """Safe-to-show status for the API and the setup command. Never includes a key."""
    try:
        s = resolve_settings(load_env() if env is None else env)
    except LLMError as exc:
        return {"configured": False, "error": str(exc)}
    if s is None:
        return {"configured": False, "mode": "fixed rules", "hint": "Run: python -m packages.core.llm setup"}
    return {
        "configured": True,
        "provider": s.provider,
        "model": s.model,
        "base_url": s.base_url or None,
        "found_by": "key in environment" if s.auto_detected else f"{ENV_PROVIDER}",
    }
