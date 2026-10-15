"""
python -m packages.core.llm [setup | test | list]

  setup  pick a provider, paste a key, make one real test call, save to .env
  test   make one real test call with whatever is configured now
  list   show every supported provider
"""

from __future__ import annotations

import asyncio
import getpass
import sys
from pathlib import Path

from .base import LLMError
from .config import (
    ENV_API_KEY,
    ENV_BASE_URL,
    ENV_MODEL,
    ENV_PROVIDER,
    build_client,
    load_env,
    resolve_settings,
)
from .providers import PRESETS

ENV_FILE = Path(".env")


def upsert_env(text: str, updates: dict[str, str]) -> str:
    """Set KEY=value lines, replacing in place and leaving every other line alone."""
    eol = "\r\n" if "\r\n" in text else "\n"
    lines = text.splitlines()
    pending = dict(updates)
    out: list[str] = []
    for line in lines:
        key = line.split("=", 1)[0].strip().removeprefix("export ").strip() if "=" in line and not line.lstrip().startswith("#") else None
        if key in pending:
            out.append(f"{key}={pending.pop(key)}")
        else:
            out.append(line)
    if pending:
        if out and out[-1] != "":
            out.append("")
        out.extend(f"{k}={v}" for k, v in pending.items())
    return eol.join(out) + eol


async def _ping(env: dict[str, str]) -> tuple[bool, str]:
    try:
        settings = resolve_settings(env)
        if settings is None:
            return False, "No model is configured."
        client = build_client(settings)
        reply = await client.complete(system="Reply with exactly one word.", user="Say: ready", max_tokens=16)
        return True, f"{settings.preset.label}, model {settings.model}, answered {reply.text[:40]!r} ({reply.total_tokens or '?'} tokens)"
    except LLMError as exc:
        return False, str(exc)


def cmd_list() -> int:
    print("Supported providers (set CROWSNEST_LLM_PROVIDER to the name on the left):\n")
    for p in PRESETS.values():
        print(f"  {p.name:<11} {p.label}")
    print("\nOr just set that provider's usual key (for example OPENAI_API_KEY) and Crowsnest finds it.")
    return 0


def cmd_test() -> int:
    ok, message = asyncio.run(_ping(load_env()))
    print(("OK  " if ok else "FAIL ") + message)
    return 0 if ok else 1


def cmd_setup() -> int:
    print("\nCrowsnest model setup\n")
    names = list(PRESETS)
    for i, n in enumerate(names, 1):
        print(f"  {i:>2}. {PRESETS[n].label}")
    raw = input("\nPick a number (or press Enter to stay on fixed rules, no model): ").strip()
    if not raw:
        print("No change. Crowsnest keeps working on its fixed rules.")
        return 0
    try:
        preset = PRESETS[names[int(raw) - 1]]
    except (ValueError, IndexError):
        print("That is not one of the numbers.")
        return 1

    updates = {ENV_PROVIDER: preset.name}
    env = {**load_env(), ENV_PROVIDER: preset.name}
    if preset.key_env and preset.name != "custom":
        if preset.key_url:
            print(f"\nGet a key at {preset.key_url}")
        key = getpass.getpass(f"Paste your {preset.label} key (hidden, Enter keeps the one already saved): ").strip()
        if key:
            updates[preset.key_env] = key
            env[preset.key_env] = key
    elif preset.name == "custom":
        updates[ENV_BASE_URL] = env[ENV_BASE_URL] = input("Address, for example http://localhost:8080/v1: ").strip()
        key = getpass.getpass("Key (hidden, Enter if none): ").strip()
        if key:
            updates[ENV_API_KEY] = env[ENV_API_KEY] = key
    model = input(f"Model [{preset.default_model or 'required'}]: ").strip()
    if model or not preset.default_model:
        updates[ENV_MODEL] = env[ENV_MODEL] = model
    for k in (ENV_MODEL, ENV_BASE_URL):
        if k in updates and not updates[k]:
            del updates[k], env[k]

    print("\nTesting with one real call…")
    ok, message = asyncio.run(_ping(env))
    print(("  ✓ " if ok else "  ✗ ") + message)
    if not ok:
        if input("Save anyway? [y/N] ").strip().lower() != "y":
            print("Nothing saved.")
            return 1
    before = ENV_FILE.read_text(encoding="utf-8") if ENV_FILE.exists() else ""
    ENV_FILE.write_text(upsert_env(before, updates), encoding="utf-8")
    print(f"Saved to {ENV_FILE.resolve()}. Restart the backend to use it.")
    return 0


def main(argv: list[str]) -> int:
    cmd = argv[0] if argv else "setup"
    handlers = {"setup": cmd_setup, "test": cmd_test, "list": cmd_list}
    if cmd not in handlers:
        print(__doc__)
        return 2
    return handlers[cmd]()


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
