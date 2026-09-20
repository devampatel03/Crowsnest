# @crowsnest/cli

A `commander`-based CLI for Crowsnest: scan projects for supply-chain risk,
investigate individual packages, check blast radius, replay past incidents,
and — via `crowsnest install` — veto risky `npm install`s above a 0.6 risk
threshold before they land in your lockfile.

## Running standalone

```bash
cd packages/cli
npm install

npm run dev            # run the CLI against source with tsx (no build step)
npm run build           # compile TypeScript to dist/ (tsc)
npm run lint             # eslint src
npm run test             # vitest run
```

After `npm run build`, the compiled CLI is runnable via `node dist/index.js`
or the `crowsnest` bin defined in `package.json`.

The CLI expects the Crowsnest FastAPI backend to be running (see the root
[README.md](../../README.md)) for commands that hit the API, such as `scan`
and `investigate`.

## Environment variables

Read from `process.env` in `src/config.ts` (and overridable via
`crowsnest config set`, persisted locally with `conf`):

- `CROWSNEST_API_URL` — backend base URL (default `http://localhost:8000`)
- `GITHUB_TOKEN` — GitHub API token, used for maintainer/commit lookups
- `NPM_TOKEN` — npm registry token, for authenticated registry queries
- `SOCKET_API_KEY` — Socket.dev API key for behavioral threat intel
- `ANTHROPIC_API_KEY` — Claude API key, used by the backend's agent pipeline

All of these are optional; missing values degrade gracefully to
cached/seeded data rather than failing outright.
