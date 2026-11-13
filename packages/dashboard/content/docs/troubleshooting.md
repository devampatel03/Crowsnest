---
title: Troubleshooting
description: "Fix common Crowsnest problems: a dashboard showing Offline or a 404, a port in use, the file-in-use error, Docker not starting and a scan that finds nothing."
slug: troubleshooting
order: 10
section: Help
updated: 2026-11-13
question: Why is Crowsnest not working?
answer: "Most problems are one of three: Crowsnest is not running, another process is using its port, or a folder is not visible to it. Find your symptom in the first table. On Windows, the error \"being used by another process\" is fixed with netstat and taskkill."
facts:
  - "Crowsnest listens on port 8000 and the dashboard on port 3000 (infra/docker-compose.yml, 2026-11-09)."
  - "Health check: http://localhost:8000/health (API source, 2026-11-09)."
  - "Windows fix for a locked data file: netstat -ano | findstr :8000, then taskkill /PID <pid> /F (project notes, 2026-10-07)."
  - "macOS and Linux fix: lsof -i :8000, then kill <pid> (project notes, 2026-10-07)."
  - "The dashboard answers only requests from this machine unless CROWSNEST_CONSOLE=on is set; the Docker Compose file sets it (dashboard proxy, 2026-11-09)."
related:
  - /docs/quickstart
  - /docs/configuration
  - /docs/installation
  - /docs/contributing
---

## Start here

| What you see | Most likely cause | Fix |
|---|---|---|
| Dashboard says Offline | Crowsnest is not running | [Check that Crowsnest is running](#check-that-crowsnest-is-running) |
| `localhost:3000` shows a 404 page | The request looks like it came from elsewhere | [The dashboard shows a 404 page](#the-dashboard-shows-a-404-page) |
| Port 3000 or 8000 is in use | Another program, or an earlier Crowsnest | [A port is in use](#a-port-is-in-use) |
| "being used by another process" | An earlier Crowsnest holds the data file | [The data file is in use](#the-data-file-is-in-use) |
| Docker stops at once | Compose is too old, or an old data volume | [Docker fails at the start](#docker-fails-at-the-start) |
| The first start never finishes | Docker cannot reach the internet | [The first start is slow](#the-first-start-is-slow) |
| A scan finds nothing | The folder is not visible, or has no lockfile | [A scan finds nothing](#a-scan-finds-nothing) |
| `command not found` | Installed without `-g` | [The terminal says command not found](#the-terminal-says-command-not-found) |
| Slack or VS Code shows nothing | Crowsnest is not reachable | [Slack](#slack-says-crowsnest-api-is-unreachable), [VS Code](#vs-code-shows-no-marks) |

## Check that Crowsnest is running

Run `crowsnest doctor`. It checks Docker, Crowsnest and the internet lookups, and says how to fix what it finds. Or open http://localhost:8000/health, which should answer `{"status":"ok", ...}` with the version.

If it does not answer, start Crowsnest again with `crowsnest start`, or with Docker Compose ([Quickstart](/docs/quickstart)). If it answers but the dashboard still says Offline, check that `NEXT_PUBLIC_API_URL` points to it.

| Port | What uses it |
|---|---|
| 8000 | Crowsnest |
| 3000 | The dashboard |

## The dashboard shows a 404 page

The dashboard answers only requests that come from your own machine. Behind a Docker port mapping or a reverse proxy, a request can look as if it came from elsewhere, and the dashboard answers 404 as though the page did not exist.

The Compose file in the repository already sets `CROWSNEST_CONSOLE=on` for the dashboard, so a fresh clone works. If you wrote your own Compose file, or run the dashboard behind a proxy, add it to the dashboard service:

```yaml
environment:
  - CROWSNEST_CONSOLE=on
```

Set it only when the port is reachable by you alone. The Compose file publishes it on `127.0.0.1`, so nothing else can connect. The dashboard has no login.

If `/docs` or `/blog` gives the 404 on port 3000, that is expected. The dashboard carries no website pages; they are at https://crowsnest.co.in.

## A port is in use

Port 8000: `crowsnest start --port 8001`, then `crowsnest config set apiUrl http://localhost:8001` so other tools find it.

Port 3000: with Docker, change the first `3000` in `"127.0.0.1:3000:3000"` in `infra/docker-compose.yml`. From source, set `PORT` before `npm run dev`. Either way, add the new address to `CROWSNEST_CORS_ORIGINS` in `.env`, or the browser will be refused.

## The data file is in use

The error reads "IO Error: Cannot open file ... being used by another process". An earlier Crowsnest process is still running and holds the data file. On Windows this happens when a `--reload` start leaves a process behind. Stop it, then start Crowsnest again.

| System | Find the process | Stop it |
|---|---|---|
| Windows | `netstat -ano \| findstr :8000` | `taskkill /PID <pid> /F` |
| macOS, Linux | `lsof -i :8000` | `kill <pid>` |

The number in the last column of the Windows command is the PID. Use `kill -9 <pid>` only if the plain `kill` does not stop it. If port 8000 looks empty but the error stays, close any leftover `python` process started from the project's Python environment. These steps come from the project's own notes and were not re-run on a machine with a stale lock.

## Docker fails at the start

Compose needs to be version 2.24 or newer, because the settings file is optional only from that version. Run `docker compose version` to check, and update Docker Desktop if it is older. You do not need to create a `.env` file to start.

If the Crowsnest container stops at once and its log says `Permission denied` for `/data/crowsnest.duckdb`, the Docker volume was created by an older version and is owned by another user. Delete it and start again; this removes the stored scan history, nothing else:

```bash
docker compose down
docker volume rm crowsnest_crowsnest-data
docker compose up
```

Run `docker volume ls` if the volume has another name. To keep the data instead, run `docker run --rm -v <volume>:/data alpine chown -R 10001:10001 /data`.

If a port is already in use, `crowsnest stop` or `docker compose down` frees it. Crowsnest uses ports 3000 and 8000.

If `crowsnest start` says Docker is not running, start Docker Desktop (or the Docker service) and run `crowsnest doctor`.

## The first start is slow

`docker compose up` downloads the backend image (about 430 MB). If the download crawls or stalls, or a build step reports `Read timed out`, Docker's own network is the problem, not Crowsnest. On Windows, quit Docker Desktop, run `wsl --shutdown`, then start it again. Next try setting DNS in Docker Desktop (Settings, Docker Engine) with `"dns": ["8.8.8.8", "1.1.1.1"]`, turn off a VPN or HTTPS scanning for a moment, or switch to another network. Run `docker compose pull` to resume the download.

## A scan finds nothing

Crowsnest reads the folder from where it runs. With Docker it reads only the folder it shares, which is nothing until you set `CROWSNEST_PROJECTS` to the folder that holds yours and run `docker compose up -d` ([Quickstart](/docs/quickstart)). The scan dialog lists what it can see, and an error says where it looks. If you started Crowsnest with `crowsnest start`, scan a folder inside the one you shared, or share a wider one with `crowsnest start --projects <folder>`. Also check that the folder has a lockfile, such as `package-lock.json`.

For any other failed scan, run `crowsnest scan /path -f json`, read the `error` line, and open an issue with it. Remove any keys first.

An old message, "Forbidden keyword in query: REPLACE", came from an early build of 0.1.0 and is fixed. If you still see it you are running an older image: run `npm install -g @crowsnest/cli@latest`, then `crowsnest stop` and `crowsnest start`.

## It shows no live details, or very little

No key is set, so Crowsnest is using cached data. That is normal. Add a key on the [Configuration](/docs/configuration) page if you want live lookups.

## The terminal says command not found

You most likely installed without `-g`, so npm put the command in the current folder where your shell cannot find it. Install it globally:

```bash
npm install -g @crowsnest/cli
crowsnest --version
```

If it is still not found, open a new terminal window. To try it once with no install, run `npx @crowsnest/cli doctor`. See [Installation](/docs/installation).

## crowsnest install let something through

`crowsnest install` does not fall back to a weaker check by itself. If Crowsnest is not running it stops, installs nothing, and tells you to run `crowsnest start`. A package passes only a check that was made. If you added `--quick`, that check was only the public malware list and release age, which does not look for look-alike or invented names, so drop `--quick` and start Crowsnest for the full check.

A package Crowsnest knows nothing about scores only 0.2, which is under the 0.6 limit, so it installs.

## Slack says Crowsnest API is unreachable

Start Crowsnest, or set `CROWSNEST_API_URL` in the bot's `.env`. See the [Slack bot](/docs/integrations/slack) page.

## VS Code shows no marks

Check that Crowsnest is running, that `crowsnest.enabled` is on, and that the file is JavaScript, TypeScript or Python. Try lowering `crowsnest.riskThreshold`. See the [VS Code extension](/docs/integrations/vscode) page.

## Still stuck

Open an issue on [GitHub](https://github.com/devampatel03/Crowsnest/issues/new/choose) with the Bug report form. Include your operating system, your Node version, the output of `crowsnest doctor`, and whether you run Docker Compose, `crowsnest start` or from source. Remove keys first. See [Contributing](/docs/contributing).

## Limits

- It does not cover every fault. It lists the ones seen in code or in a real run.
- It does not replace a bug report. If you are still stuck, open an issue.
