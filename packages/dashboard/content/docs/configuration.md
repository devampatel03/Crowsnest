---
title: Configuration
description: "Crowsnest runs with no settings. See which API keys are optional, what each one adds, where to put them and what happens when one is missing."
slug: configuration
order: 8
section: Reference
updated: 2026-10-24
question: Which settings and API keys does Crowsnest need?
answer: None. Crowsnest runs with no settings, and every API key is optional. Put keys in a file named .env in the Crowsnest folder, or save them with crowsnest config set. Without keys, Crowsnest uses cached data and fixed rules.
facts:
  - "Five optional lookup settings: ANTHROPIC_API_KEY, GITHUB_TOKEN, GITHUB_ORG, SOCKET_API_KEY and NPM_TOKEN (.env.example, 2026-10-07)."
  - "Three optional Slack keys, plus a channel name (.env.example, 2026-10-07)."
  - "Default Crowsnest address: http://localhost:8000 (CLI, Slack bot and VS Code defaults, 2026-10-07)."
  - "The install stop limit of 0.6 is fixed and cannot be configured (install check, 2026-10-07)."
  - "Saved terminal settings beat environment variables (CLI source, 2026-10-07)."
related:
  - /docs/installation
  - /docs/integrations/slack
  - /docs/troubleshooting
  - /docs/cli
---

Crowsnest needs no settings to run. Every API key is optional. Put keys in a file named `.env` in the Crowsnest folder, or save them with `crowsnest config set`. Without keys, Crowsnest uses cached data.

## Which API keys can I add?

All of these are optional.

| Key | What it adds | What is sent when you set it |
|---|---|---|
| `ANTHROPIC_API_KEY` | AI-assisted analysis and explanations. Without it, Crowsnest uses fixed rules. Other providers work too: see [Choose your AI model](/docs/integrations/models). | Details of your scan go to your chosen model provider (Anthropic's API by default): the project folder path, the kind of project, the time of the last scan, any recent campaign names and your GitHub organisation name. For each check that finds something, up to 20 matching results (package names, versions and related details) are sent too. |
| `GITHUB_TOKEN` | Repository details from GitHub, with higher rate limits. | Repository and maintainer lookups go to GitHub. |
| `GITHUB_ORG` | Your GitHub organisation name, for repository lookups. | The organisation name goes to GitHub. |
| `SOCKET_API_KEY` | Live threat alerts from Socket. | Package names (up to 50 npm packages per scan) go to Socket. |
| `NPM_TOKEN` | Signed-in requests to the npm registry. | Sent to the npm registry with package lookups. |

Without any key, a scan still sends package names to public services: the registries your packages come from (npm, PyPI, crates.io, Packagist, RubyGems and the Go module proxy; up to 500 packages per kind per scan), and the OSV malicious-package list, which is asked about every package name and exact version in your lockfiles. Crowsnest sends no usage data to its authors.

## Which Slack keys do I need?

Only if you run the bot: `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, `CROWSNEST_ALERT_CHANNEL` (default `#security`) and `CROWSNEST_DASHBOARD_URL` (default `http://localhost:3000`). See the [Slack bot](/docs/integrations/slack) page.

## Which addresses and files can I set?

| Setting | Default | Used by |
|---|---|---|
| `CROWSNEST_API_URL` | `http://localhost:8000` | Terminal command, Slack bot |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Dashboard (Docker sets it to the service name) |
| `CROWSNEST_API_HOST` | `0.0.0.0` | Crowsnest, when started by its own entry point |
| `CROWSNEST_API_PORT` | `8000` | Crowsnest, when started by its own entry point |
| `CROWSNEST_DB_PATH` | `./crowsnest.duckdb` | Where Crowsnest keeps its data file (Docker: `/data/crowsnest.duckdb`) |
| `CROWSNEST_SNAPSHOT_DIR` | `./snapshots` | Where saved snapshots go (Docker: `/data/snapshots`) |
| `CROWSNEST_MIN_RELEASE_AGE_DAYS` | `2` | Crowsnest. Days a package version must have been public before `crowsnest install` and `crowsnest check` allow it. `0` turns it off |
| `CROWSNEST_LIVE_LOOKUPS` | `true` | Crowsnest. Set to `false` to stop install and pull request checks from calling registries and the malicious-package list, for offline use |
| `crowsnest.apiUrl`, `crowsnest.enabled`, `crowsnest.riskThreshold` | See the [VS Code page](/docs/integrations/vscode) | The VS Code extension |

## How do I save settings in the terminal command?

```bash
crowsnest config set anthropicApiKey your-key
crowsnest config set apiUrl http://localhost:8000
crowsnest config get
```

A value saved this way beats the matching environment variable. `config get` shows secrets as `***set***` or `(not set)`.

## What happens when a key is missing?

Nothing breaks. Crowsnest falls back to cached data and fixed rules, so you see fewer live details and no error. Do not treat a quiet scan with no keys as a clean bill of health. It reflects only what Crowsnest could see.

## What this does not do

- It does not let you change the 0.6 install stop.
- It does not store keys securely. `.env` is a plain text file, and the terminal command keeps saved values in a local file. Keep both out of version control.
- It does not check your keys when it starts. A wrong key shows up as missing live details.
- It does not validate other settings. A mistyped address shows up as Offline or "unreachable" messages.

If something does not behave, see [Troubleshooting](/docs/troubleshooting). To set up the pieces that use these keys, see [Installation](/docs/installation) and [CLI usage](/docs/cli).

**Start with no keys. Add one when you miss what it gives you.**
