---
title: Quickstart
description: "Start Crowsnest and its dashboard with two commands, scan an example project with one click, then point it at your own. No account and no API keys needed."
slug: quickstart
order: 2
section: Get started
updated: 2026-11-09
howTo: true
question: How do I start Crowsnest?
answer: Clone the repository and run docker compose up --build, then open localhost:3000 and press Scan a project. An example project is ready to scan, and your own folder is one setting away. Or run npm install -g @crowsnest/cli and crowsnest start for the terminal. You need Docker, no account and no API keys.
facts:
  - "Dashboard port: 3000. Crowsnest service port: 8000 (infra/docker-compose.yml)."
  - "docker compose up --build runs from the repository root, with no settings file needed (compose.yaml, infra/docker-compose.yml)."
  - "The example project in examples/demo-project is shared with the container by default, so a first scan needs no setup (infra/docker-compose.yml)."
  - "CROWSNEST_PROJECTS names the folder on your machine that holds your projects; it is shared read only at /projects (infra/docker-compose.yml)."
  - "Stored data lives in one Docker volume named crowsnest-data (infra/docker-compose.yml)."
related:
  - /docs/installation
  - /docs/dashboard
  - /docs/troubleshooting
  - /docs/cli
---

There are two ways to start Crowsnest, and both run the same backend in Docker. Neither needs an account or an API key.

## Which way should I start?

| | Dashboard | Terminal |
|---|---|---|
| You get | The dashboard at http://localhost:3000, plus the backend | The `crowsnest` command, with the backend in Docker |
| You need | Docker with Docker Compose, and Git | Node.js 20 or newer, and Docker |
| Start with | `docker compose up --build` | `npm install -g @crowsnest/cli`, then `crowsnest start` |

Start with the dashboard if you want to look around: it shows every call in one place. Start with the terminal if you want to scan from a shell, stop risky installs, or use the VS Code extension. Both use port 8000, so run one at a time.

## How do I start the dashboard?

1. **Get the code.**
   ```bash
   git clone https://github.com/devampatel03/Crowsnest.git
   cd Crowsnest
   ```
2. **Start Crowsnest.**
   ```bash
   docker compose up --build
   ```
   The first run builds two images, so it takes a few minutes. There is no settings file to create: every key is optional.
3. **Open the dashboard** at http://localhost:3000. The status at the top right should say **Live**. If it says Offline, go to [Troubleshooting](/docs/troubleshooting).
4. **Scan a project.** Press **Scan a project** and pick `demo-project` from the list. It is a small example with risky packages on purpose, so you see what a finding looks like. Calls appear under **Needs your attention**.
5. **Stop Crowsnest.**
   ```bash
   docker compose down
   ```
   Your data stays in the Docker volume `crowsnest-data`. Add `-v` to delete it.

## How do I scan my own project?

Crowsnest runs in Docker, so it can only read the folder you share with it. Tell it which folder holds your projects, once.

1. **Name the folder.** Create a file called `.env` in the Crowsnest folder with one line, using the folder that *contains* your projects:
   ```text
   CROWSNEST_PROJECTS=C:\Users\you\code
   ```
   On macOS and Linux it looks like `CROWSNEST_PROJECTS=/home/you/code`.
2. **Restart.**
   ```bash
   docker compose up -d
   ```
3. **Scan.** Press **Scan a project** (or press `s`). Every project in that folder that has a lockfile is listed. Pick one, or type its name, such as `my-app`. A path as it appears on your machine, such as `C:\Users\you\code\my-app`, works too.

Crowsnest only reads the folder, never changes it. It looks two levels down, so `code/my-app` and `code/team/web` are both listed.

## How do I start the terminal command?

```bash
npm install -g @crowsnest/cli
crowsnest start
crowsnest scan .
```

Use `-g`. Without it npm leaves the command in the current folder and your shell cannot find it. The first `crowsnest start` downloads the backend, about 430 MB. It shares the current folder with it, read only, so run it from the folder that holds your projects, or use `crowsnest start --projects <folder>`. `crowsnest stop` stops it, and `crowsnest doctor` says what is wrong if something is. The [CLI usage](/docs/cli) page lists every command.

`crowsnest install` needs Crowsnest running: it checks first, and if nothing answers it stops and tells you to run `crowsnest start`.

## What should I see the first time?

On a fresh start Crowsnest has no calls of your own, so pages are empty until a scan runs. Scan `demo-project` to see findings at once. Do not read an empty page as a result for your own project.

## What this does not do

- It does not read folders you have not shared. Set `CROWSNEST_PROJECTS` first.
- It does not need, or ask for, an account.
- It does not start the Slack bot or VS Code extension. Those have their own pages.

Next, install the terminal command from the [Installation](/docs/installation) page, then read [Using the dashboard](/docs/dashboard).
