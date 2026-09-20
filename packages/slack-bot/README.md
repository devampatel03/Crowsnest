# @crowsnest/slack-bot

A `@slack/bolt` Socket Mode bot that subscribes to the Crowsnest backend's
`/api/events` SSE stream, posts CRITICAL/HIGH incident alerts as Block Kit
messages to a security channel, and handles slash commands
(`/crowsnest-scan`, `/crowsnest-investigate`, `/crowsnest-blast-radius`).

## Running standalone

```bash
cd packages/slack-bot
npm install

npm run dev          # tsx watch src/index.ts — auto-restarts on change
npm run build        # tsc, output to dist/
npm run start         # node dist/index.js (run the built bot)
npm run typecheck      # tsc --noEmit
```

`src/config.ts` loads `.env` from both the repo root and the package
directory via `dotenv`, so you can keep a single root `.env` (see
`.env.example`) or a package-local one. The bot needs the Crowsnest FastAPI
backend reachable at `CROWSNEST_API_URL` to fetch incidents and stream
events. Missing Slack credentials print a warning (`warnMissingConfig`) but
don't crash the process, so the dev loop stays usable without a live
Slack app.

## Environment variables

Read from `process.env` in `src/config.ts`:

- `SLACK_BOT_TOKEN` — bot OAuth token (`xoxb-...`)
- `SLACK_APP_TOKEN` — Socket Mode app-level token (`xapp-...`)
- `SLACK_SIGNING_SECRET` — app signing secret
- `CROWSNEST_API_URL` — backend base URL (default `http://localhost:8000`)
- `CROWSNEST_ALERT_CHANNEL` — Slack channel to post alerts to (default
  `#security`)
- `PORT` — local port for the Bolt app (default `3001`)
- `CROWSNEST_DASHBOARD_URL` — dashboard URL linked from alert messages
  (default `http://localhost:3000`)
