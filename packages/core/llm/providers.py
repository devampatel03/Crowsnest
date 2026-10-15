"""
Provider presets and the two client implementations.

Anthropic has its own API. Nearly everything else (OpenAI, Gemini, Groq, Mistral, DeepSeek, xAI, Together, OpenRouter,
Ollama, LM Studio, vLLM, and any company gateway) speaks the OpenAI chat-completions format, so one small client covers
them all. Adding a provider that speaks that format is one line in PRESETS.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass

import httpx

from .base import LLMError, LLMResponse


@dataclass(frozen=True)
class Preset:
    name: str
    label: str
    kind: str  # "anthropic" | "openai"
    base_url: str
    key_env: str  # environment variable holding the key ("" = no key needed)
    default_model: str
    key_url: str = ""  # where a person gets a key


# Default models are cheap, fast starting points. Any model the provider offers can be set with CROWSNEST_LLM_MODEL.
PRESETS: dict[str, Preset] = {
    p.name: p
    for p in [
        Preset("anthropic", "Anthropic (Claude)", "anthropic", "", "ANTHROPIC_API_KEY",
               "claude-haiku-4-5-20251001", "https://console.anthropic.com/settings/keys"),
        Preset("openai", "OpenAI", "openai", "https://api.openai.com/v1", "OPENAI_API_KEY",
               "gpt-4o-mini", "https://platform.openai.com/api-keys"),
        Preset("gemini", "Google Gemini", "openai", "https://generativelanguage.googleapis.com/v1beta/openai",
               "GEMINI_API_KEY", "gemini-2.0-flash", "https://aistudio.google.com/apikey"),
        Preset("openrouter", "OpenRouter (hundreds of models, one key)", "openai", "https://openrouter.ai/api/v1",
               "OPENROUTER_API_KEY", "openai/gpt-4o-mini", "https://openrouter.ai/keys"),
        Preset("groq", "Groq", "openai", "https://api.groq.com/openai/v1", "GROQ_API_KEY",
               "llama-3.1-8b-instant", "https://console.groq.com/keys"),
        Preset("mistral", "Mistral", "openai", "https://api.mistral.ai/v1", "MISTRAL_API_KEY",
               "mistral-small-latest", "https://console.mistral.ai/api-keys"),
        Preset("deepseek", "DeepSeek", "openai", "https://api.deepseek.com/v1", "DEEPSEEK_API_KEY",
               "deepseek-chat", "https://platform.deepseek.com/api_keys"),
        Preset("together", "Together AI", "openai", "https://api.together.xyz/v1", "TOGETHER_API_KEY",
               "meta-llama/Llama-3.3-70B-Instruct-Turbo", "https://api.together.ai/settings/api-keys"),
        Preset("xai", "xAI (Grok)", "openai", "https://api.x.ai/v1", "XAI_API_KEY",
               "grok-3-mini", "https://console.x.ai"),
        Preset("ollama", "Ollama (runs on your machine, no key)", "openai", "http://localhost:11434/v1", "",
               "llama3.1", ""),
        Preset("lmstudio", "LM Studio (runs on your machine, no key)", "openai", "http://localhost:1234/v1", "",
               "local-model", ""),
        Preset("custom", "Any OpenAI-compatible address (vLLM, a company gateway, ...)", "openai", "",
               "CROWSNEST_LLM_API_KEY", "", ""),
    ]
}

# Order tried when no provider is named: the first one whose key is present wins. Local presets are never guessed.
AUTO_DETECT_ORDER = ["anthropic", "openai", "gemini", "openrouter", "groq", "mistral", "deepseek", "together", "xai"]


class AnthropicClient:
    provider = "anthropic"

    def __init__(self, api_key: str, model: str, base_url: str = "") -> None:
        from anthropic import AsyncAnthropic

        self.model = model
        self._client = AsyncAnthropic(api_key=api_key, base_url=base_url or None)

    async def complete(self, *, system: str, user: str, max_tokens: int = 1024) -> LLMResponse:
        try:
            r = await self._client.messages.create(
                model=self.model,
                max_tokens=max_tokens,
                system=system,
                messages=[{"role": "user", "content": user}],
            )
        except Exception as exc:  # the SDK raises many types; the caller only needs a readable reason
            raise LLMError(f"Anthropic call failed: {exc}") from exc
        text = "".join(getattr(b, "text", "") for b in r.content)
        return LLMResponse(text.strip(), r.usage.input_tokens, r.usage.output_tokens)


class OpenAICompatClient:
    def __init__(self, provider: str, base_url: str, api_key: str, model: str, timeout: float = 60.0) -> None:
        if not base_url:
            raise LLMError("No address set. Set CROWSNEST_LLM_BASE_URL (for example http://localhost:8080/v1).")
        if not model:
            raise LLMError("No model set. Set CROWSNEST_LLM_MODEL to the model name your provider uses.")
        self.provider = provider
        self.model = model
        self._url = base_url.rstrip("/") + "/chat/completions"
        self._headers = {"Content-Type": "application/json", **({"Authorization": f"Bearer {api_key}"} if api_key else {})}
        self._timeout = timeout

    async def complete(self, *, system: str, user: str, max_tokens: int = 1024) -> LLMResponse:
        body = {
            "model": self.model,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "temperature": 0,
            "max_tokens": max_tokens,
        }
        async with httpx.AsyncClient(timeout=self._timeout) as http:
            for attempt in range(2):
                try:
                    res = await http.post(self._url, headers=self._headers, json=body)
                except httpx.HTTPError as exc:
                    raise LLMError(f"Could not reach {self._url}: {exc}") from exc

                # Newer OpenAI models reject max_tokens and want max_completion_tokens (and no temperature).
                if res.status_code == 400 and "max_completion_tokens" in res.text and "max_tokens" in body:
                    body["max_completion_tokens"] = body.pop("max_tokens")
                    body.pop("temperature", None)
                    continue
                if res.status_code in (429, 500, 502, 503, 504) and attempt == 0:
                    await asyncio.sleep(1.0)
                    continue
                break

        if res.status_code in (401, 403):
            raise LLMError(f"{self.provider} rejected the key (HTTP {res.status_code}). Check it, and that it matches the provider.")
        if res.status_code == 404:
            raise LLMError(f"{self.provider} answered 404. Check the address ({self._url}) and the model name ({self.model}).")
        if res.status_code >= 400:
            raise LLMError(f"{self.provider} answered HTTP {res.status_code}: {res.text[:300]}")
        try:
            data = res.json()
            text = data["choices"][0]["message"]["content"] or ""
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise LLMError(f"{self.provider} sent a reply Crowsnest cannot read: {res.text[:200]}") from exc
        usage = data.get("usage") or {}
        return LLMResponse(text.strip(), int(usage.get("prompt_tokens") or 0), int(usage.get("completion_tokens") or 0))
