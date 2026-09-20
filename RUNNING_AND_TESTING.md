# Running & Testing Crowsnest

A hands-on walkthrough for standing up every part of Crowsnest locally and
exercising each feature. For a one-paragraph "what is this" see README.md;
for architecture internals see `crowsnest_comprehensive_architecture.md`.

---

## 0. Fastest path (one command)

```bash
git clone <this-repo-url> crowsnest && cd crowsnest
./scripts/bootstrap.sh
```

This copies `.env.example` → `.env` (if missing), creates the Python venv,
installs backend deps, and installs all JS workspace deps. It does **not**
start any servers — that's Part 1 below. It works with an empty `.env`;
every external integration (Anthropic, GitHub, Socket.dev, Slack) degrades
gracefully to cached/seeded/deterministic behavior when its key is unset, so
you can do everything in this guide with zero API keys configured.

If you'd rather do it by hand, or `bootstrap.sh` doesn't fit your shell,
see `setup.md` for the step-by-step version.

---

## 1. Start the services

Open one terminal per service. All of them read `CROWSNEST_API_URL` /
`NEXT_PUBLIC_API_URL` (default `http://localhost:8000`) to find the backend.

### 1a. Backend (required for everything else)

```bash
source .venv-claude/bin/activate   # Windows: .venv-claude\Scripts\activate
export DEMO_MODE=true              # optional — see below
uvicorn packages.core.api:app --host 0.0.0.0 --port 8000 --reload
```

Look for `[info] seed.complete` then `Uvicorn running on http://0.0.0.0:8000`.
`DEMO_MODE=true` makes the backend emit a synthetic stream of fake npm
publish events over SSE (`lodash`, `event-stream`, `ua-parser-js`, etc. with
made-up risk scores) — useful for seeing the Horizon firehose move without
waiting on real npm traffic. Confirm the backend is alive:

```bash
curl http://localhost:8000/health
```

### 1b. Dashboard

```bash
cd packages/dashboard && npm run dev
```

Open `http://localhost:3000`. The header's "Live" dot should be green
within a few seconds (SSE connection to `/api/events`). If it's not green,
the backend isn't reachable — check 1a first.

### 1c. Slack bot (optional — only if you've set `SLACK_BOT_TOKEN` /
`SLACK_APP_TOKEN` / `SLACK_SIGNING_SECRET` in `.env`)

```bash
cd packages/slack-bot && npm run dev
```

Missing tokens print a warning but don't crash the process — you'll just
see Bolt fail to actually connect. Skip this section if you don't have a
Slack app set up; everything else in this guide works without it.

### 1d. VS Code extension (optional)

```bash
code packages/vscode-extension
```
Then in that VS Code window: `npm install`, `npm run compile`, press
**F5**. A second window titled `[Extension Development Host]` opens.

---

## 2. Exercise every dashboard feature

With backend + dashboard running:

### Horizon tab (`/horizon`) — live threat feed
1. Click **Scan Project**, enter a real path to a project with a
   `package-lock.json` (or use this repo's own root — it has one), click
   **Start Scan**.
2. Watch the scan-progress banner move through `Ingesting…` →
   `Running LangGraph Agent Team…` → `Scan Completed`.
3. If `DEMO_MODE=true`, watch the npm publish firehose panel on the right
   update in real time.
4. Click an incident card (once one appears) to expand its forensics —
   attack pattern, confidence, blast radius, recommended remediation.

### Lookout tab (`/lookout`) — maintainer reputation
Scroll the maintainer table, sorted by risk score. The seeded data
includes a maintainer flagged with a `1.00` risk score (a seeded IOC
match) — a good sanity check that the seed data loaded correctly.

### Hold tab (`/hold`) — dependency inventory
After a scan, this lists every package from the scanned project's
lockfile, tagged `direct` or `transitive`, filterable by ecosystem/search.

### Log tab (`/log`) — incident history & Time Machine
Shows past incidents. Click **Replay** on any incident card to re-run
detection against a historical DuckDB snapshot (Time Machine) — this
exercises `CoralEngine.snapshot()`/`restore_snapshot()`.

---

## 3. Exercise every CLI command

From repo root (or anywhere, once `CROWSNEST_API_URL` is set/defaulted):

```bash
cd packages/cli && npm install && npm run build
node dist/index.js scan .                          # full scan of a project
node dist/index.js investigate lodash               # deep-dive one package
node dist/index.js blast-radius --maintainer sindresorhus
node dist/index.js replay --ioc shai-hulud-wave-4    # Time Machine replay
node dist/index.js watch                             # daemon mode, streams incidents to stdout
node dist/index.js install left-pad-helper           # safe-install veto check
node dist/index.js install left-pad-helper --crowsnest-acknowledge-risk   # override a block
node dist/index.js config get                        # show current CLI config
```

The `install` command is the "wedge feature" demo moment — if `/api/veto`
scores the package above the risk threshold, the install is blocked with a
forensic explanation; `--crowsnest-acknowledge-risk` overrides it.

(Optional) link it globally to use the bare `crowsnest` command instead of
`node dist/index.js`:
```bash
cd packages/cli && npm link
crowsnest scan .
```

---

## 4. Exercise the VS Code extension

In the `[Extension Development Host]` window from step 1d:
1. Create a file `test.js`.
2. Type `const parser = require('ua-parser-js');` and wait ~1s (debounced
   check).
3. Look for a colored gutter icon (🔴/🟠/🟡 by severity) and a wavy
   underline on the import.
4. Hover over the import for the full risk breakdown tooltip.
5. Run the **Crowsnest: Open Dashboard** command from the command palette.

---

## 5. Exercise the Slack bot

In your Slack workspace (bot must be running per 1c):
```
/crowsnest-scan <path>
/crowsnest-investigate <package>
/crowsnest-blast-radius <maintainer>
/crowsnest-status
```
High/critical incidents detected by any scan also post automatically to
whatever channel `CROWSNEST_ALERT_CHANNEL` is set to (default `#security`).

---

## 6. Run the automated test suites

```bash
# Python — 76 tests covering CoralEngine's SQL validation/param
# substitution, the SQL-injection-bypass regression, lockfile parsing,
# query-template allowlisting, and each agent node's deterministic fallback
.venv-claude/Scripts/python.exe -m pytest packages/core/tests -v

# JS — cli (config defaults + command-parsing sanity) and dashboard
# (one render smoke test per tab)
pnpm run test

# Full workspace lint + typecheck + build, same as CI
pnpm run lint
pnpm run typecheck
pnpm run build
```

All of the above should exit 0. `pnpm run lint` may show a couple of
harmless pre-existing warnings (unused imports in the CLI, an anonymous
default export in a config file) — those are warnings, not errors, and
don't fail the build.

---

## 7. Manually verify the SQL-injection fix

This is the bug that was fixed in the security-hardening commit — worth
seeing rejected with your own eyes:

```bash
curl -X POST http://localhost:8000/api/query \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT 1;DROP TABLE crowsnest_incidents"}'
```

Expect a `400` with
`{"detail":"Multi-statement SQL is not allowed (semicolon-separated statements detected)"}`
— not a `200` with the table actually dropped. A normal single-statement
query still works fine:
```bash
curl -X POST http://localhost:8000/api/query \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT 1 AS ok"}'
# -> [{"ok":1}]
```

---

## 8. Troubleshooting

- **`IO Error: Cannot open file ... being used by another process`** — a
  zombie uvicorn `--reload` process is holding `crowsnest.duckdb`. Windows:
  `netstat -ano | findstr :8000` then `taskkill /PID <pid> /F`. macOS/Linux:
  `lsof -i :8000` then `kill <pid>`.
- **Dashboard's Live dot stays red** — backend isn't up, or CORS is
  misconfigured. Confirm `curl http://localhost:8000/health` works first.
- **A scan produces no incidents** — expected on a clean/small project with
  no seeded IOC matches in its dependency tree; try scanning this repo
  itself, which has seed data wired in.
- **Everything "works" but nothing calls real Anthropic/GitHub/Socket
  APIs** — you haven't set the relevant key in `.env`. This is intentional
  graceful degradation, not a bug (see CLAUDE.md's "Conventions & gotchas").
