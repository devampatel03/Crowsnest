<div align="center">

# Crowsnest

**A lookout for what you install.**

Crowsnest checks the packages in your software project and gives each one a plain call:
**Clear**, **Watch** or **Hold**. A Hold means stop and check before you install or keep it.

[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Version 0.1.0](https://img.shields.io/badge/version-0.1.0-informational)](#status)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[Quickstart](#quickstart) · [Ways to use it](#ways-to-use-it) · [Documentation](#documentation) · [Contributing](#contributing)

</div>

---

## What is Crowsnest?

Crowsnest is a free, open-source tool that runs on your own machine. It reads the lockfile in your
project, looks at the packages and the people who publish them, and tells you which ones look wrong
before they reach production. There is no account to create, and it works without any API keys.

It is built for the kinds of attack that ordinary vulnerability scanners do not see:

- **Hijacked packages.** A new publisher appears, the long-time one goes quiet, and build files
  change soon after.
- **Look-alike names.** A package that imitates a popular one and waits for a typing mistake.
- **Made-up packages.** Names that an AI assistant invented, which an attacker can then register.
- **Worms and sudden bursts.** One account publishing many packages in a few minutes.
- **Packages with a clean-looking record** that still behave badly once installed.

Each finding comes with a one-sentence reason and the first step to take. Crowsnest is not a
replacement for a vulnerability scanner such as Dependabot or Snyk. It covers the cases they do
not.

## Quickstart

You need Docker with Docker Compose, and Git. Nothing else.

```bash
git clone https://github.com/devampatel03/Crowsnest.git
cd Crowsnest
cp .env.example .env        # every key inside is optional
docker compose -f infra/docker-compose.yml up --build
```

The first run builds two images, so allow a few minutes. Then open
**http://localhost:3000**, press **Scan a project**, and enter the folder you want checked.

To check that the service is up, open http://localhost:8000/health. To stop it:

```bash
docker compose -f infra/docker-compose.yml down
```

Prefer to run it from source on macOS, Linux or Windows? See
[Installation](packages/dashboard/content/docs/installation.md).

## Ways to use it

| | What it does | Where to start |
|---|---|---|
| **Dashboard** | Horizon (what needs attention now), Lookout (the people who publish your packages), Installed (everything your project uses) and Log (every call Crowsnest has made). | [Dashboard guide](packages/dashboard/content/docs/dashboard.md) |
| **Terminal** | Scan a project, check one package, see who else is affected, replay an earlier day, and install through a safety check that stops a risky `npm install` before it runs. | [Command line guide](packages/dashboard/content/docs/cli.md) |
| **VS Code** | A warning on the import line of a risky package while you type. | [VS Code guide](packages/dashboard/content/docs/integrations/vscode.md) |
| **Slack** | Alerts in a channel you choose, plus four slash commands such as `/crowsnest-scan`. | [Slack guide](packages/dashboard/content/docs/integrations/slack.md) |

Crowsnest reads `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `poetry.lock`, `Cargo.lock`
and `go.sum`.

## Optional keys

Crowsnest starts and works with none of these. Each one adds a little more.

| Key | What it adds |
|---|---|
| `ANTHROPIC_API_KEY` | Plain-language explanations written with AI help. Without it, fixed rules write them. |
| `GITHUB_TOKEN`, `GITHUB_ORG` | Repository and publisher details, with higher rate limits. |
| `SOCKET_API_KEY` | Live threat alerts from Socket. |
| `NPM_TOKEN` | Signed-in requests to the npm registry. |

The [Configuration](packages/dashboard/content/docs/configuration.md) page lists what each key sends
and where. Without a key, Crowsnest falls back to saved data instead of failing.

## What Crowsnest does not do

- It does not stop you from forcing an install. It warns; the decision stays with you.
- It cannot catch an attack that has left no public trace anywhere yet. It tends to catch the next
  wave, once the same actor republishes.
- It does not replace vulnerability scanning for known CVEs. Use both.

## Documentation

The full guides live in [`packages/dashboard/content/docs`](packages/dashboard/content/docs) and are
served by the dashboard at `/docs`:

[Introduction](packages/dashboard/content/docs/introduction.md) ·
[Quickstart](packages/dashboard/content/docs/quickstart.md) ·
[Installation](packages/dashboard/content/docs/installation.md) ·
[Command line](packages/dashboard/content/docs/cli.md) ·
[Using the dashboard](packages/dashboard/content/docs/dashboard.md) ·
[Configuration](packages/dashboard/content/docs/configuration.md) ·
[FAQ](packages/dashboard/content/docs/faq.md) ·
[Troubleshooting](packages/dashboard/content/docs/troubleshooting.md)

## Status

Crowsnest is at version **0.1.0**: usable today, with a young API that may change between minor
versions. The command line tool and the VS Code extension are built from source and are not yet
published to a package store. Release notes are in the
[0.1.0 post](packages/dashboard/content/blog/crowsnest-0-1-0-release-notes.md).

## Contributing

Crowsnest is an open-source project and contributions are welcome: bug reports with a lockfile that
reproduces the problem, new detection ideas, documentation fixes, and code. Please read
[CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. It is short.

### For contributors: how the repository is laid out

| Path | What lives there |
|---|---|
| `packages/core` | The Python service (FastAPI): lockfile readers, the data layer on embedded DuckDB, the detection queries and the analysis pipeline. Managed with `pip`, not part of the pnpm workspace. |
| `packages/dashboard` | The Next.js app: public site, docs and blog (`content/`), and the console. |
| `packages/cli` | The terminal command (`commander`). |
| `packages/slack-bot` | The Slack bot (`@slack/bolt`, Socket Mode). |
| `packages/vscode-extension` | The editor extension. |
| `infra` | Docker Compose file and the service Dockerfile. |

Run the service from source:

```bash
python -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -e .
uvicorn packages.core.api:app --host 0.0.0.0 --port 8000 --reload
```

Run the dashboard and its checks:

```bash
cd packages/dashboard
pnpm install
pnpm run dev           # http://localhost:3000
pnpm run typecheck
pnpm run lint
pnpm run test
```

Two things worth knowing before you change the core: the data file allows one read-write connection
at a time, and every query the analysis step writes is checked against a block-list of write
operations. Please keep both rules when you add a query. The
[architecture notes](crowsnest_comprehensive_architecture.md) go deeper.

## License

[Apache 2.0](LICENSE). Use it, fork it, ship it.
