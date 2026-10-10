---
title: CLI usage
description: "Use the crowsnest command to scan a project, check one package and stop risky installs at risk 0.6. Commands, options and exit codes for your terminal."
slug: cli
order: 4
section: Use
updated: 2026-10-07
question: How do I use the crowsnest command?
answer: Run crowsnest scan to check a project, crowsnest investigate to check one package, and crowsnest install to check before npm installs. Install stops at risk 0.6 or above and exits with 3. A scan exits with 1 when it finds something, so it works in a build check.
facts:
  - "Seven commands: scan, investigate, blast-radius, replay, watch, install and config (crowsnest --help, 2026-10-07)."
  - "Install stops at risk 0.6 or above, shown as 60 percent in the terminal; the limit is fixed (install check, 2026-10-07)."
  - "Exit codes: scan returns 0 when clean, 1 when it finds something, 2 when it fails; a stopped install returns 3 (CLI source, 2026-10-07)."
  - "Scan checks for completion every 2 seconds (CLI source, 2026-10-07)."
  - "Version 0.1.0 (crowsnest --version, 2026-10-07)."
related:
  - /docs/installation
  - /docs/configuration
  - /docs/dashboard
  - /docs/troubleshooting
---

The `crowsnest` command scans a project, checks one package, and stops risky installs. It needs Crowsnest running on port 8000. A scan exits with 1 when it finds something, which makes it usable in a build check.

## What do I need first?

Build the command ([Installation](/docs/installation)) and start Crowsnest ([Quickstart](/docs/quickstart)). From source, replace `crowsnest` below with `node dist/index.js`, run from `packages/cli`. Run `crowsnest --help` for the command list, or `crowsnest <command> --help` for one command.

## How do I scan a project?

```bash
crowsnest scan /path/to/project
```

With no path it scans the current folder. It waits for the scan to finish, then prints the most serious calls. Real output of `crowsnest scan --help` on 2026-10-07:

```text
Usage: crowsnest scan [options] [path]

Run a full supply chain scan on a project

Options:
  -e, --ecosystem <eco>  package ecosystem (npm|pypi|cargo|go) (default: "npm")
  -f, --format <fmt>     output format (table|json) (default: "table")
  --watch                daemon mode: re-run every 5 minutes
  -h, --help             display help for command
```

Exit codes: **0** nothing found, **1** one or more problems found, **2** the scan failed. With `-f json` the command prints the result and exits 0 even when problems were found, so read the output instead of the exit code. In Docker, the path must be one the Crowsnest service can see (see the [Quickstart](/docs/quickstart)).

## How do I check one package?

```bash
crowsnest investigate left-pad
```

Add `--deep` for extra follow-up checks. `-e` picks the kind of project.

## How do I see who else is affected?

```bash
crowsnest blast-radius --maintainer some-login
crowsnest blast-radius --all
```

The first lists your projects that use packages from one publisher. `--all` ranks the fifty publishers with the most risk.

## How do I install a package safely?

```bash
crowsnest install some-package
crowsnest install @scope/some-package@1.2.3
```

Crowsnest checks the package, prints the result, then runs `npm install` for you if the check passes. Real output on 2026-10-07, for a package Crowsnest had no data on:

```text
- Checking left-pad before install...
✔ Approved: left-pad

════════════════════════════════════════════════════════
[crowsnest] ✓ APPROVED: left-pad
[crowsnest]   ℹ  Package not found in Crowsnest database (may be new)
[crowsnest]   Risk score: 20%
════════════════════════════════════════════════════════

Proceeding with installation...
```

Read that result carefully. A package Crowsnest knows nothing about adds only 0.2 of risk, which is under the 0.6 limit, so the install goes ahead. The check is strongest for packages Crowsnest has already seen, for example through a scan.

- Risk 0.6 (60 percent) or above stops the install and exits with 3. A package on the known-harmful list always stops.
- To install anyway, run `crowsnest install some-package --crowsnest-acknowledge-risk`. Use it only when you have read the reasons. The stop screen prints the override as an `npm install` line; run it as `crowsnest install` instead, because npm does not know the flag.
- If Crowsnest cannot be reached, it prints a warning and installs anyway. Nothing is checked in that case. Real output:

  ```text
  - Checking is-odd before install...
  ✖ Crowsnest API unreachable — proceeding without veto check
  Start the API with: uvicorn packages.core.api:app --reload
  ```
- Only `crowsnest install` is checked. A plain `npm install` is not.

## How is the install risk worked out?

`crowsnest install` adds up points for each warning sign it finds, up to a total of 1.00:

| Warning sign | Points |
|---|---|
| Registered less than 30 days ago | 0.40 |
| Fewer than 1,000 downloads a week | 0.30 |
| No link to a code repository | 0.20 |
| Name is one or two letters away from a package with over 1,000,000 weekly downloads | 0.35 |

Crowsnest also adds points for a package it has no data on (0.20), for names AI assistants are known to invent, and for threat alerts from Socket when you set a key. A package on the known-harmful list always stops.

A total of 0.6 or above stops the install. The VS Code extension starts showing a warning at 0.5 by default. The home page sample uses the four signs in the table.

## How do I replay an earlier day?

```bash
crowsnest replay --date 2026-05-11
```

Runs a check against a saved snapshot of an earlier day. `--ioc <name>` picks a named campaign. `-f json` prints the raw result. This is a terminal feature only; the dashboard does not offer it. Snapshots are not checked here, so a date with no snapshot may return nothing.

## How do I watch live events?

```bash
crowsnest watch
```

Streams live events to your terminal until you stop it. For Slack alerts, use the [Slack bot](/docs/integrations/slack).

## How do I save settings?

```bash
crowsnest config get
crowsnest config set apiUrl http://localhost:8000
```

Keys you can set: `apiUrl`, `githubToken`, `npmToken`, `socketApiKey`, `anthropicApiKey`. A saved value beats the matching environment variable. `config get` shows secrets as `***set***` or `(not set)`. Real output with nothing saved:

```text
  Crowsnest Configuration

  apiUrl                http://localhost:8000
  githubToken           (not set)
  npmToken              (not set)
  socketApiKey          (not set)
  anthropicApiKey       (not set)
```

## What this does not do

- `scan --watch` appears in `--help` but does not repeat the scan yet. Run the scan again yourself.
- The 0.6 stop limit is fixed. You cannot change it.
- A package Crowsnest has no data on adds 0.2 risk and still installs.
- The built-in lists of known harmful packages and known AI-invented names are not included in the Docker image as of 2026-10-07 (checked: both lists were empty in a fresh container). Those two checks have nothing to match in the Docker setup. From source, the lists load from the project's seed folder.
- A scan on a fresh install can fail in 0.1.0 as of 2026-10-07. See [Troubleshooting](/docs/troubleshooting) for the exact message and what to do.
- It does not check a plain `npm install` or `pip install`.

See also [Configuration](/docs/configuration), [Using the dashboard](/docs/dashboard) and the [VS Code extension](/docs/integrations/vscode).

**Make `crowsnest install` your habit. It is the only moment Crowsnest can stop a package before it arrives.**
