"""Model-provider layer: one interface, any model. See docs/integrations/models for setup."""

from .base import LLMClient, LLMError, LLMResponse, extract_json
from .config import build_client, describe, get_llm, load_env, resolve_settings
from .providers import PRESETS

__all__ = [
    "PRESETS",
    "LLMClient",
    "LLMError",
    "LLMResponse",
    "build_client",
    "describe",
    "extract_json",
    "get_llm",
    "load_env",
    "resolve_settings",
]
