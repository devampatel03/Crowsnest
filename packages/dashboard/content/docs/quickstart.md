---
title: Quickstart
description: "Install Docker, run three commands, and open the Crowsnest dashboard at localhost:3000. No account and no API keys needed. A step-by-step quickstart."
slug: quickstart
order: 2
section: Get started
updated: 2026-10-07
howTo: true
question: How do I start Crowsnest?
answer: Install Docker and Git, clone the repository, copy .env.example to .env, then run docker compose up --build. Open localhost:3000 for the dashboard. You need no account and no API keys. The first run builds two images, so allow time.
facts:
  - "Dashboard port: 3000. Crowsnest service port: 8000 (infra/docker-compose.yml, 2026-10-07)."
  - "Health check: http://localhost:8000/health returned {\"status\":\"ok\",\"version\":\"0.1.0\"} on 2026-10-07."
  - "Stored data lives in one Docker volume named crowsnest-data (infra/docker-compose.yml, 2026-10-07)."
  - "The compose file shares none of your project folders with the container (infra/docker-compose.yml, 2026-10-07)."
related:
  - /docs/installation
  - /docs/dashboard
  - /docs/troubleshooting
  - /docs/cli
---

Install Docker, run three commands, and open http://localhost:3000. Crowsnest starts with no account and no API keys. Allow time for the first build.

## What do I need before I start?

Docker with Docker Compose, and Git. Nothing else.

## How do I start Crowsnest?

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
4. **Check that it is running.** Open http://localhost:8000/health. You should see this, which is the real reply from the 0.1.0 code:
   ```json
   {"status":"ok","version":"0.1.0"}
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

As of 2026-10-07, a scan on a fresh install with no API keys failed in a real run against the 0.1.0 code. The exact message is on the Troubleshooting page.

That is a known fault in 0.1.0, not a problem with your project or your setup. The [Troubleshooting](/docs/troubleshooting) page says what still works and what to do.

## What this does not do

- It does not make a scan work for folders Docker cannot see. Share the folder first.
- It does not need, or ask for, an account.
- It does not start the Slack bot or VS Code extension. Those have their own pages.

Next, install the terminal command from the [Installation](/docs/installation) page, then read [Using the dashboard](/docs/dashboard).

**Scan one real project. The first call you read teaches you more than this page.**
