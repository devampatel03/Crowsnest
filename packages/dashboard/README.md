# @crowsnest/dashboard

The Crowsnest dashboard: a Next.js App Router UI with four tabs — Horizon
(live threat feed), Lookout (maintainer reputation), Hold (dependency
inventory), and Log (incident history/replay) — driven by Server-Sent Events
from the FastAPI backend's `/api/events` endpoint.

## Running standalone

```bash
cd packages/dashboard
npm install

npm run dev          # next dev, http://localhost:3000
npm run build        # next build
npm run start        # next start (serve the production build)
npm run lint          # eslint .
npm run typecheck     # tsc --noEmit
npm run test           # vitest run
```

The dashboard needs the Crowsnest FastAPI backend running (see the root
[README.md](../../README.md)) — without it, the Live indicator won't turn
green and API calls in `lib/api.ts` / `lib/sse.ts` will fail.

## Environment variables

Read via `process.env.NEXT_PUBLIC_API_URL` in `lib/api.ts`, `lib/sse.ts`,
and exposed through `next.config.js`:

- `NEXT_PUBLIC_API_URL` — base URL of the Crowsnest API (default
  `http://localhost:8000`). Must be prefixed `NEXT_PUBLIC_` since it's read
  client-side by the browser, not just at build/server time.

No other env vars are required to run the dashboard itself.
