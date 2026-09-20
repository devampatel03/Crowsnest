# graphify
- **graphify** (`.claude/skills/graphify/SKILL.md`) - any input to knowledge graph. Trigger: `/graphify`
When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.



# Crowsnest

Supply chain security sentinel: detects malicious packages, account takeovers,
dependency confusion, typosquatting, and AI-hallucinated ("slopsquatted")
packages before they land in production lockfiles.

## Architecture

- **CoralEngine** (`packages/core/coral/engine.py`) — embedded DuckDB
  (`crowsnest.duckdb`) that federates lockfiles, GitHub, npm/PyPI registry
  data, and threat intel into one relational store. Every data source is a
  SQL table; detections are SQL `JOIN`s, not bespoke API polling.
- **LangGraph agent pipeline** (`packages/core/agents/graph.py`) — 4-node
  async state machine per scan:
  1. `detection_planner.py` — Claude-Haiku picks which SQL templates to run
     (falls back to `_default_queries` if the API is down).
  2. `investigation.py` — runs SQL, classifies hits into `AlertObject`
     incidents via Claude-Haiku (falls back to `_synthesize_incidents`).
  3. `triage.py` — rescoring severity, SHA-256 dedup within a 7-day window.
  4. `remediation.py` — drafts PR diffs, Slack blocks, ticket bodies.
- **SQL query library** (`packages/core/queries/templates.py`) — 12+
  parameterized templates (e.g. `XZ_PATTERN`, `SHAI_HULUD`, `SLOPSQUATTING`,
  `SLSA_POISONING`) for known supply-chain attack shapes.
- **Lockfile parser** (`packages/core/sources/lockfile.py`) — parses
  `package-lock.json` (v1/v2/v3), classifies deps as direct vs. transitive.

## Packages (pnpm workspace)

- `packages/core` — Python/FastAPI backend + CoralEngine + agents (not part
  of the pnpm workspace; managed separately via pip).
- `packages/dashboard` — Next.js App Router dashboard (Horizon, Lookout,
  Hold, Log tabs), SSE-driven via `/api/events`.
- `packages/slack-bot` — `@slack/bolt` Socket Mode bot, subscribes to SSE,
  posts alerts, handles `/crowsnest-scan` etc.
- `packages/vscode-extension` — inline gutter warnings via debounced
  AST/regex import scan + `/api/veto`.
- `packages/cli` — `commander`-based CLI; safe installer vetoes risky
  `npm install`s above a 0.6 risk threshold.

## Running locally

```bash
# Backend (from repo root)
source .venv-claude/bin/activate         # Windows: .venv-claude\Scripts\activate
uvicorn packages.core.api:app --host 0.0.0.0 --port 8000 --reload

# Any JS package
cd packages/<name> && npm install && npm run dev
```

Root-level pnpm scripts (`dev`, `build`, `lint`, `typecheck`) run
`--parallel` across the JS workspaces (cli, dashboard, vscode-extension,
slack-bot, shared) — they do **not** touch `packages/core`.

## Conventions & gotchas

- DuckDB allows a single read-write connection: writes go through
  `asyncio.Lock()`; reads use thread-local `.cursor()` instances.
- Agent-issued SQL is validated by a write-operation block-list — never
  bypass this when adding new query templates.
- On Windows, orphaned uvicorn `--reload` subprocesses can lock
  `crowsnest.duckdb`; kill the process holding port 8000 if you see
  `IO Error: Cannot open file ... being used by another process`
  (Windows: find the PID via `netstat -ano | findstr :8000` then
  `taskkill /PID <pid> /F`; macOS/Linux: `lsof -i :8000` then `kill <pid>`).
- Missing API keys (Socket.dev, GitHub, Anthropic) degrade gracefully to
  cached/seeded data — don't assume a scan failure means a bug.
- Reference docs: `crowsnest_comprehensive_architecture.md` (deep dive),
  `setup.md` (step-by-step local setup).
