---
title: Installation
description: "Install Crowsnest with Docker or from source on macOS, Linux or Windows. Requirements, the command line tool, updating and uninstalling, step by step."
slug: installation
order: 3
section: Get started
updated: 2026-11-13
howTo: true
question: How do I install Crowsnest?
answer: Install the command line tool with npm install -g @crowsnest/cli, then run crowsnest start. It runs Crowsnest in Docker with one command. You can also run Crowsnest with Docker Compose, or from source with Python 3.12 or newer and Node 20 or newer. The VS Code extension is on the Marketplace.
facts:
  - "Source requirements: Python 3.12 or newer, Node 20 or newer, pnpm or npm (pyproject.toml and README, 2026-10-07)."
  - "Docker images use Python 3.12 and Node 26 (infra/Dockerfile.api and the dashboard Dockerfile, 2026-11-13)."
  - "Ports: 8000 for Crowsnest, 3000 for the dashboard (infra/docker-compose.yml, 2026-10-07)."
  - "The command line tool is on npm as @crowsnest/cli and needs Node 20 or newer (npm registry, 2026-11-04)."
  - "crowsnest start runs the backend in Docker from ghcr.io/devampatel03/crowsnest-api, shares one folder read only, and listens on this machine only (CLI source, 2026-11-04)."
  - "docker compose up pulls the same published image for the backend, and builds only the dashboard (infra/docker-compose.yml, 2026-11-13)."
  - "Version 0.1.3 (health check, 2026-11-13)."
related:
  - /docs/quickstart
  - /docs/configuration
  - /docs/cli
  - /docs/troubleshooting
---

Run Crowsnest with Docker, or from source with Python 3.12 or newer and Node 20 or newer. Docker is the shorter path. Both give you the same Crowsnest.

## Which install should I pick?

| | Terminal command | Docker Compose | From source |
|---|---|---|---|
| You need | Node 20 or newer, and Docker to run the backend | Docker with Docker Compose | Python 3.12 or newer, Node 20 or newer, pnpm or npm |
| Ports | 8000 (Crowsnest) | 8000 (Crowsnest), 3000 (dashboard) | The same |
| Best for | Checking projects from the terminal and the VS Code extension | Trying the dashboard, or running it on one machine | Changing the code |

## How do I install with Docker?

Follow the [Quickstart](/docs/quickstart). It is two commands, `git clone` and `docker compose up`, plus one line in a `.env` file that names the folder holding your projects. Compose pulls the backend image instead of building it, so the first start is a download of about 430 MB, not a long build. The dashboard is the only part built on your machine.

## How do I install from source on macOS, Linux or WSL?

1. **Get the code and the settings file.**
   ```bash
   git clone https://github.com/devampatel03/Crowsnest.git
   cd Crowsnest
   cp .env.example .env
   ```
2. **Run the setup script.** It copies `.env.example` to `.env` if there is no `.env`, creates a Python virtual environment in the Crowsnest folder, and installs the Python and JavaScript packages. It does not start anything.
   ```bash
   ./scripts/bootstrap.sh
   ```
3. **Start Crowsnest.** Leave this running.
   ```bash
   source <the environment the setup script created>/bin/activate
   uvicorn packages.core.api:app --port 8000
   ```
   The setup script prints the name of the environment it creates. Replace the placeholder with that name.
4. **Start the dashboard.** In a second terminal:
   ```bash
   cd packages/dashboard
   npm install
   npm run dev
   ```
   Open http://localhost:3000. It opens on Horizon.

## How do I install from source on Windows PowerShell?

Use the same steps with two changes. Copy the settings file with `Copy-Item .env.example .env`. Create and activate the Python environment yourself, because the setup script needs a POSIX shell such as Git Bash:

```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -e .
uvicorn packages.core.api:app --port 8000
```

Then start the dashboard as in step 4 above.

## How do I install the terminal command?

```bash
npm install -g @crowsnest/cli
crowsnest --version
crowsnest start
```

Use `-g`. Without it npm puts the command in the current folder, and your shell cannot find it. The npm page's own install box leaves `-g` out. `crowsnest start` downloads the backend the first time (about 430 MB) and runs it at http://localhost:8000. It needs Docker running. It shares the current folder with the backend, read only, so run it from the folder that holds your projects, or use `crowsnest start --projects <folder>`. `crowsnest stop` stops it, and `crowsnest doctor` checks what is wrong.

Without Docker, `crowsnest check` still works as a quick check, and `crowsnest install --quick` runs a reduced check. Plain `crowsnest install` checks on every run that Crowsnest is running, and if nothing answers it installs nothing and tells you to run `crowsnest start`. See [CLI usage](/docs/cli).

To run the command from a source checkout instead, build it in `packages/cli` with `npm install` and `npm run build`, then type `node dist/index.js` where the docs say `crowsnest`.

## How do I add Slack and VS Code?

Follow the [Slack bot](/docs/integrations/slack) and [VS Code extension](/docs/integrations/vscode) pages. Neither is needed to use Crowsnest.

## How do I update?

```bash
git pull
docker compose pull
docker compose up -d --build crowsnest-dashboard
```

`docker compose pull` fetches the newest backend image. To update the terminal command, run `npm install -g @crowsnest/cli` again, and `crowsnest stop` then `crowsnest start` to run the matching backend. From source, run `git pull`, then `pip install -e .` and `npm install` again.

## How do I uninstall?

```bash
docker compose down -v
```

Then delete the `Crowsnest` folder. The `-v` deletes the stored data. If you used the terminal command, its saved settings live in your user settings folder; remove them with your usual cleanup.

## What this does not do

- It does not install the VS Code extension for you. Install it from the Marketplace, see [VS Code extension](/docs/integrations/vscode).
- It does not provide a hosted version. You run Crowsnest on your own machine.
- It does not check your versions of Python or Node. A version that is too old shows up as an error during setup.

Next, [scan a project from the terminal](/docs/cli), or set optional keys on the [Configuration](/docs/configuration) page.
