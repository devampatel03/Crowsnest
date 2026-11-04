---
title: Troubleshooting
description: "Fix common Crowsnest problems: a dashboard showing Offline, port 8000 in use, the file-in-use error, Docker not starting, and a scan that finds nothing."
slug: troubleshooting
order: 10
section: Help
updated: 2026-11-04
question: Why is Crowsnest not working?
answer: "Most problems are one of three: another process is using port 8000, Crowsnest is not running, or a folder is not visible to it. Find your symptom below. On Windows, the error \"being used by another process\" is fixed with netstat and taskkill."
facts:
  - "Crowsnest listens on port 8000 and the dashboard on port 3000 (infra/docker-compose.yml, 2026-10-07)."
  - "Health check: http://localhost:8000/health (API source, 2026-10-07)."
  - "Windows fix for a locked data file: netstat -ano | findstr :8000, then taskkill /PID <pid> /F (project notes, 2026-10-07)."
  - "macOS and Linux fix: lsof -i :8000, then kill <pid> (project notes, 2026-10-07)."
  - "A scan with no API keys finished normally on the published 0.1.1 image on 2026-11-04 (real run). The older 'Forbidden keyword in query: REPLACE' failure is fixed."
related:
  - /docs/quickstart
  - /docs/configuration
  - /docs/installation
  - /docs/contributing
---

Most problems are one of three: something else is using port 8000, Crowsnest is not running, or a folder is not visible to it. Find your symptom below. Each fix is a command or a click.

## The dashboard says Offline. What do I do?

Crowsnest is not running or is on another address.

1. Open http://localhost:8000/health. You should see `{"status":"ok","version":"0.1.0"}`.
2. If the page does not load, start Crowsnest again (see the [Quickstart](/docs/quickstart)).
3. If it loads, check that `NEXT_PUBLIC_API_URL` points to it.

## What if I see "IO Error: Cannot open file ... being used by another process"?

An earlier Crowsnest process is still running and holds the data file. Stop it. On Windows this happens when a `--reload` start leaves a process behind.

Windows:

```text
netstat -ano | findstr :8000
taskkill /PID <pid> /F
```

The number in the last column of the first command is the PID. Use it in the second.

macOS and Linux:

```text
lsof -i :8000
kill <pid>
```

Use `kill -9 <pid>` only if the plain `kill` does not stop it. Then start Crowsnest again. If port 8000 looks empty but the error stays, close any leftover `python` process that was started from the project's Python environment. These steps come from the project's own notes and were not re-run on a machine with a stale lock.

## Docker fails at the start, or the Crowsnest container stops at once. Why?

The compose file needs a `.env` file in the Crowsnest folder, next to the `infra` folder. If it was missing, Docker may have created a folder named `.env`. Delete that folder, create the file with `cp .env.example .env`, and start again.

## My scan finds nothing, or says the folder cannot be found. Why?

Crowsnest reads the folder from where it runs. With Docker, the service cannot see your computer's folders unless you share them (see the [Quickstart](/docs/quickstart)). Also check that the folder has a lockfile, such as `package-lock.json`.

## My scan failed with "Forbidden keyword in query: REPLACE". What now?

This came from an early build of 0.1.0 and is fixed. A scan with no API keys on the published 0.1.1 image, checked on 2026-11-04, finished normally. If you still see it, you are running an older image. Update, then start again:

```bash
npm install -g @crowsnest/cli@latest
crowsnest stop
crowsnest start
```

The old output, from the command line:

```text
- Initiating Crowsnest scan on /projects/my-app...
✖ Scan failed: Forbidden keyword in query: REPLACE
```

Your project and your setup were fine. I checked the command line scan only. The dashboard scan button and the Slack scan command use the same service, but I did not run them for this note.

For any other failed scan, run `crowsnest scan /path -f json` and read the `error` line, then open an issue with it and remove any keys first.

## It shows no live details, or very little. Is that a fault?

No key is set, so Crowsnest is using cached data. That is normal. Add a key on the [Configuration](/docs/configuration) page if you want live lookups.

## The terminal says "command not found". What now?

From source, the command is `node dist/index.js`, run from `packages/cli` after `npm run build`. See [Installation](/docs/installation).

## crowsnest install installed something I expected it to stop. Why?

If Crowsnest cannot be reached, the install runs with a warning. Look for the line "Crowsnest API unreachable — proceeding without veto check". Start Crowsnest and try again. Also, a package Crowsnest knows nothing about scores only 0.2, which is under the 0.6 limit, so it installs.

## Slack says "Crowsnest API is unreachable". What now?

Start Crowsnest, or set `CROWSNEST_API_URL` in `.env` for the bot. See the [Slack bot](/docs/integrations/slack) page.

## VS Code shows no marks. Why?

Check that Crowsnest is running, that `crowsnest.enabled` is on, and that the file is JavaScript, TypeScript or Python. Try lowering `crowsnest.riskThreshold`. See the [VS Code extension](/docs/integrations/vscode) page.

## What this does not do

- It does not cover every fault. It lists the ones seen in code or in a run on 2026-10-07.
- It does not fix the scan fault above. That needs a change to Crowsnest itself.
- It does not replace a bug report. If you are still stuck, open an issue.

## I am still stuck. What do I do?

Open an issue on [GitHub](https://github.com/devampatel03/Crowsnest/issues/new/choose) with the Bug report form. Include your operating system, your Python and Node versions, and whether you run Docker or from source. Remove keys first. See [Contributing](/docs/contributing).

**Include the exact error text in your report. It is the fastest way to a fix.**
