---
title: Installation
description: "Install Crowsnest with Docker or from source on macOS, Linux or Windows. Requirements, the command line tool, updating and uninstalling, step by step."
slug: installation
order: 3
section: Get started
updated: 2026-10-07
howTo: true
question: How do I install Crowsnest?
answer: Use Docker, or install from source with Python 3.12 or newer and Node 18 or newer. Docker is the shorter path. The command line tool and VS Code extension are built from source, because neither is published to a package store yet.
facts:
  - "Source requirements: Python 3.12 or newer, Node 18 or newer, pnpm or npm (pyproject.toml and README, 2026-10-07)."
  - "Docker images use Python 3.12 and Node 20 (infra/Dockerfile.api and the dashboard Dockerfile, 2026-10-07)."
  - "Ports: 8000 for Crowsnest, 3000 for the dashboard (infra/docker-compose.yml, 2026-10-07)."
  - "The command line tool is not published to npm; build it from source (owner confirmation, 2026-10-07)."
  - "Version 0.1.0 (health check, 2026-10-07)."
related:
  - /docs/quickstart
  - /docs/configuration
  - /docs/cli
  - /docs/troubleshooting
---

Run Crowsnest with Docker, or from source with Python 3.12 or newer and Node 18 or newer. Docker is the shorter path. Both give you the same Crowsnest.

## Which install should I pick?

| | Docker | From source |
|---|---|---|
| You need | Docker with Docker Compose | Python 3.12 or newer, Node 18 or newer, pnpm or npm |
| Ports | 8000 (Crowsnest), 3000 (dashboard) | The same |
| Best for | Trying it, or running it on one machine | Changing the code, or using the terminal command |

## How do I install with Docker?

Follow the [Quickstart](/docs/quickstart). It is three commands.

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
   Open http://localhost:3000.

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

The command line tool is not published to npm. Build it from the repository:

```bash
cd packages/cli
npm install
npm run build
node dist/index.js --version
```

Real output on 2026-10-07:

```text
0.1.0
```

`node dist/index.js` is the `crowsnest` command. The [CLI usage](/docs/cli) page writes `crowsnest` for short; from source, type `node dist/index.js` (run from `packages/cli`) instead.

## How do I add Slack and VS Code?

Follow the [Slack bot](/docs/integrations/slack) and [VS Code extension](/docs/integrations/vscode) pages. Neither is needed to use Crowsnest.

## How do I update?

```bash
git pull
docker compose -f infra/docker-compose.yml up --build
```

From source, run `git pull`, then `pip install -e .` and `npm install` again.

## How do I uninstall?

```bash
docker compose -f infra/docker-compose.yml down -v
```

Then delete the `Crowsnest` folder. The `-v` deletes the stored data. If you used the terminal command, its saved settings live in your user settings folder; remove them with your usual cleanup.

## What this does not do

- It does not install the terminal command or the VS Code extension for you. Both are built from source.
- It does not include the lists of known harmful packages and known AI-invented names in the Docker image as of 2026-10-07. Install from source if you want those checks.
- It does not provide a hosted version. You run Crowsnest on your own machine.
- It does not check your versions of Python or Node. A version that is too old shows up as an error during setup.

Next, [scan a project from the terminal](/docs/cli), or set optional keys on the [Configuration](/docs/configuration) page.

**Docker if you want to look. Source if you want to change something.**
