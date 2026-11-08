---
title: Quickstart
description: "Start Crowsnest with the dashboard in Docker, or with one terminal command. No account and no API keys needed. A step-by-step quickstart for both ways."
slug: quickstart
order: 2
section: Get started
updated: 2026-11-08
howTo: true
question: How do I start Crowsnest?
answer: Run npm install -g @crowsnest/cli and then crowsnest start for the terminal, or clone the repository, copy .env.example to .env and run docker compose up --build for the dashboard at localhost:3000. You need Docker. You need no account and no API keys. The first run downloads or builds images, so allow time.
facts:
  - "Dashboard port: 3000. Crowsnest service port: 8000 (infra/docker-compose.yml, 2026-10-07)."
  - "Health check: http://localhost:8000/health returned {\"status\":\"ok\",\"version\":\"0.1.1\",\"projects_root\":\"/projects\"} on 2026-11-07 from the published 0.1.1 image."
  - "Stored data lives in one Docker volume named crowsnest-data (infra/docker-compose.yml, 2026-10-07)."
  - "The compose file shares none of your project folders with the container (infra/docker-compose.yml, 2026-10-07)."
related:
  - /docs/installation
  - /docs/dashboard
  - /docs/troubleshooting
  - /docs/cli
---

There are two ways to start Crowsnest, and they work together. The dashboard runs from the repository with Docker Compose. The terminal command starts the same backend with one command. Neither needs an account or an API key.

## Which way should I start?

| | Dashboard | Terminal |
|---|---|---|
| You get | The dashboard at http://localhost:3000, plus the backend | The `crowsnest` command, with the backend in Docker |
| You need | Docker with Docker Compose, and Git | Node.js 20 or newer, and Docker |
| Start with | `docker compose -f infra/docker-compose.yml up --build` | `npm install -g @crowsnest/cli`, then `crowsnest start` |

Start with the dashboard if you want to look around: it shows every call in one place. Start with the terminal if you want to scan from a shell, stop risky installs, or use the VS Code extension. Both listen on port 8000, so run one at a time.

## How do I start the terminal command?

```bash
npm install -g @crowsnest/cli
crowsnest start
crowsnest scan .
```

Use `-g`. Without it npm leaves the command in the current folder and your shell cannot find it. The first `crowsnest start` downloads the backend, about 430 MB. It shares the current folder with it, read only. `crowsnest stop` stops it, and `crowsnest doctor` says what is wrong if something is. The [CLI usage](/docs/cli) page lists every command.

## What do I need before I start the dashboard?

Docker with Docker Compose, and Git. Nothing else.

## How do I start the dashboard?

1. **Get the code.**
   ```bash
   git clone https://github.com/devampatel03/Crowsnest.git
   cd Crowsnest
   ```
2. **Create your settings file.** Do this before step 3.
   ```bash
   cp .env.example .env
   ```
   On Windows Command Prompt use `copy .env.example .env`; in PowerShell use `Copy-Item .env.example .env`. The file can stay as it is, because every key in it is optional. Docker needs the file to exist.
3. **Start Crowsnest.**
   ```bash
   docker compose -f infra/docker-compose.yml up --build
   ```
   The first run builds two images, so it takes a while. When it settles, two things are running: the Crowsnest service on port 8000 and the dashboard on port 3000.
4. **Check that it is running.** Open http://localhost:8000/health. You should see something like this, the real reply from the 0.1.1 code:
   ```json
   {"status":"ok","version":"0.1.1","projects_root":"/projects"}
   ```
5. **Open the dashboard.** Go to http://localhost:3000. If the status at the top right says Offline instead of Live, go to [Troubleshooting](/docs/troubleshooting).
6. **Scan a project.** Press **Scan a project**, enter the folder, and press **Scan**. Crowsnest reads the lockfile in that folder, such as a `package-lock.json`. Calls appear under **Needs your attention**. Read the next section first if you use Docker.
7. **Stop Crowsnest.**
   ```bash
   docker compose -f infra/docker-compose.yml down
   ```
   Your data stays in the Docker volume `crowsnest-data`. Add `-v` to delete it.

## How do I scan a folder from Docker?

The Crowsnest service reads folders from inside its container, and the compose file shares none of yours. Add one line under `volumes:` for `crowsnest-api` in `infra/docker-compose.yml`, then restart:

```yaml
      - /path/to/your/projects:/projects:ro
```

Scan `/projects/my-app` instead of your own path. On Windows Docker Desktop, write the left side as a Windows path, for example `C:\Users\you\projects:/projects:ro`. The `:ro` makes the share read-only.

Checked on 2026-10-07: a container started with a folder shared this way could read a project's `package-lock.json` at `/projects/my-app`.

## What should I see the first time?

On a fresh start Crowsnest has no calls of your own, so pages may be empty until a scan runs. Do not read starter or empty pages as a result for your project.

Checked on 2026-11-04: the published 0.1.1 image, started with no API keys and a folder shared read only, scanned a three-package project and finished with findings. If a scan fails for you, the [Troubleshooting](/docs/troubleshooting) page says what to check.

## What this does not do

- It does not make a scan work for folders Docker cannot see. Share the folder first.
- It does not need, or ask for, an account.
- It does not start the Slack bot or VS Code extension. Those have their own pages.

Next, install the terminal command from the [Installation](/docs/installation) page, then read [Using the dashboard](/docs/dashboard).
