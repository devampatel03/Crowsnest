# @crowsnest/dashboard

One Next.js App Router build that serves two apps, each on its own port:

| App | Address | What it is |
|---|---|---|
| Dashboard | http://localhost:3000 | The product UI. Opens on Horizon (live threat feed) at `/`, with Lookout (maintainer reputation), Installed (dependency inventory, at `/hold`) and Log (incident history) beside it. Driven by Server-Sent Events from the FastAPI backend's `/api/events` endpoint. |
| Website | http://localhost:3001 | The public site: landing page, docs, blog, glossary. |

The dashboard never serves website pages, and the website never serves the dashboard. `proxy.ts` decides, using
`CROWSNEST_APP` (see `lib/app-mode.ts` and `lib/console-route.ts`).

## Running standalone

```bash
cd packages/dashboard
npm install

npm run dev          # the dashboard, http://localhost:3000
npm run dev:site     # the website, http://localhost:3001
npm run build        # next build (one build serves both)
npm run start        # the dashboard from the production build
npm run start:site   # the website from the production build
npm run lint         # eslint .
npm run typecheck    # tsc --noEmit
npm run test         # vitest run
```

`PORT` overrides the port, for example `PORT=3002 npm run dev`. The two dev servers can run side by side. If you
move the dashboard off port 3000, add its new address to `CROWSNEST_CORS_ORIGINS` in the Crowsnest `.env`.

The dashboard needs the Crowsnest FastAPI backend running (see the root
[README.md](../../README.md)) — without it, the Live indicator won't turn
green and API calls in `lib/api.ts` / `lib/sse.ts` will fail.

## Environment variables

- `NEXT_PUBLIC_API_URL` — base URL of the Crowsnest API (default
  `http://localhost:8000`). Read by `lib/api.ts` and `lib/sse.ts` and exposed through `next.config.js`. It must be
  prefixed `NEXT_PUBLIC_` because the browser reads it, and it is fixed when the app is built.
- `CROWSNEST_APP` — `console` makes the process the dashboard; anything else is the website. `npm run dev`,
  `npm run start` and the Docker image set it for you, so you rarely touch it.
- `CROWSNEST_CONSOLE` — `on` lets the dashboard answer requests that do not look local, which is needed behind Docker
  Desktop's port mapping or a reverse proxy. The Compose file sets it. `off` closes the dashboard completely. Set `on`
  only where the port is reachable by you alone: the dashboard has no login.
- `NEXT_PUBLIC_DOCS_URL` — where the dashboard's Docs and help links go (default `https://crowsnest.co.in`). Set it to
  `http://localhost:3001` to read a local copy of the website.
