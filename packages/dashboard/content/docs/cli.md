---
title: CLI usage
description: "Use the crowsnest command to scan a project, check one package, vet a pull request and stop risky installs. Commands, options and exit codes for your terminal."
slug: cli
order: 4
section: Use
updated: 2026-11-04
question: How do I use the crowsnest command?
answer: Scan a project, check a package, vet a pull request or stop a risky install, all from your terminal. A scan exits with 1 when it finds something, and a stopped install or check exits with 3, so both can fail a build.
facts:
  - "Eleven commands: start, stop, doctor, scan, investigate, blast-radius, replay, watch, install, check and config (crowsnest --help, 2026-10-31)."
  - "Without Crowsnest running, install and check use a quick check: the public malware list, release changes against the previous version, and release age; --quick and --full choose a mode (CLI source, 2026-10-31)."
  - "crowsnest start runs the backend in Docker, listening on this machine only, and shares one folder with it read only; stored data is kept in a Docker volume (CLI source, 2026-10-31)."
  - "Install stops at risk 0.6 or above, shown as 60 percent in the terminal; that limit is fixed. It also stops a version a public malware list names, and a version younger than two days unless you change that (install check, 2026-10-24)."
  - "Exit codes: scan returns 0 when clean, 1 when it finds something, 2 when it fails; a stopped install or check returns 3 (CLI source, 2026-10-24)."
  - "Scan checks for completion every 2 seconds (CLI source, 2026-10-07)."
  - "Version 0.1.2 (crowsnest --version, 2026-11-08)."
related:
  - /docs/installation
  - /docs/configuration
  - /docs/dashboard
  - /docs/troubleshooting
---

## Before you start

Most commands need Crowsnest running on port 8000; `install` and `check` also work without it, as a quick check. [Install the command](/docs/installation), then start Crowsnest. With Docker installed, one command does it:

```bash
crowsnest start
```

The first run downloads Crowsnest, starts it on port 8000 and shares the current folder with it, read only. To share another folder, run `crowsnest start --projects /path/to/folder`. Stop it with `crowsnest stop`; your stored data is kept unless you add `--delete-data`.

If something does not work, `crowsnest doctor` checks Docker, Crowsnest and the internet lookups, and says how to fix what it finds. Other ways to start Crowsnest are in the [Quickstart](/docs/quickstart).

## The commands

| Command | What it does |
|---|---|
| `crowsnest scan [path]` | Scans a project and prints the most serious calls. |
| `crowsnest investigate <package>` | Checks one package. |
| `crowsnest install <package>` | Checks a package, then installs it only if it passes. |
| `crowsnest check` | Vets the package versions a pull request adds or changes. |
| `crowsnest blast-radius` | Shows which of your projects use a publisher's packages. |
| `crowsnest replay` | Runs a check against a saved snapshot of an earlier day. |
| `crowsnest watch` | Streams live events to your terminal. |
| `crowsnest config` | Reads and saves settings. |
| `crowsnest start`, `stop`, `doctor` | Run, stop and diagnose the backend. |

Run `crowsnest --help` for the list, or `crowsnest <command> --help` for one command. When running from source, replace `crowsnest` with `node dist/index.js` from `packages/cli`.

## Scan a project

```bash
crowsnest scan /path/to/project
```

With no path, it scans the current folder, waits for the scan to finish, then prints the most serious calls. Use `-e` to pick the kind of project (`npm`, `pypi`, `cargo` or `go`) and `-f json` for raw output.

| Exit code | Meaning |
|---|---|
| 0 | Nothing found. |
| 1 | One or more problems found. |
| 2 | The scan failed. |

With `-f json` the command always exits 0, so read the output instead of the exit code.

If you started Crowsnest with `crowsnest start`, scan a folder inside the one you shared; any other folder is refused, with a message saying how to share it. With the Docker Compose setup, the path must be one the Crowsnest service can see ([Quickstart](/docs/quickstart)).

## Check one package

```bash
crowsnest investigate left-pad
```

Add `--deep` for extra follow-up checks.

## See who else is affected

```bash
crowsnest blast-radius --maintainer some-login
crowsnest blast-radius --all
```

The first lists your projects that use packages from one publisher. `--all` ranks the fifty publishers with the most risk.

## Install a package safely

```bash
crowsnest install some-package
crowsnest install @scope/some-package@1.2.3
crowsnest install some-package@^1.2.0
```

Crowsnest works out the exact version npm would install, checks it, and installs that same version if it passes. A range such as `^1.2.0` is resolved first, so the version checked is always the version installed.

A version is stopped when:

- **A public malware list names it.** Crowsnest checks the OpenSSF malicious-packages list, through OSV.dev.
- **Its release looks hijacked.** It compares the release with the previous one and looks for a changed build repository, dropped build proof, a new publisher, an added install script or dependency, a sudden size jump, or a year of silence.
- **It is under two days old.** Most compromises in the 2026 incident replays were removed from the registry within three hours. Change the wait with `--min-release-age <days>`, or use `0` to turn it off.
- **Its risk is 0.6 (60 percent) or above.** See [how risk is worked out](#how-risk-is-worked-out).

When a version is stopped, nothing is installed and the command exits with 3:

```text
- Checking axios before install...
✖ Blocked: axios@1.14.1

════════════════════════════════════════════════════════
[crowsnest] ✖ BLOCKED: axios@1.14.1
[crowsnest]
[crowsnest]   !!  ACTIVE IOC: axios@1.14.1 is listed as malicious (MAL-2026-2307)
[crowsnest]
[crowsnest]   Risk score:  100%
[crowsnest]
[crowsnest]   To override (risk accepted):
[crowsnest]     crowsnest install axios@1.14.1 --crowsnest-acknowledge-risk
════════════════════════════════════════════════════════
```

To install anyway, run the override line, and only after you have read the reasons.

| Option | Effect |
|---|---|
| `--min-release-age <days>` | Sets the minimum age of a release. `0` turns it off. |
| `--quick` | Uses the quick check even when Crowsnest is running. |
| `--full` | Refuses to run unless Crowsnest is running. |
| `--strict` | Refuses to install when any check could not be completed. |

Things to know:

- If Crowsnest could not look something up, the result says "Not checked" and names it. A failed lookup is never shown as clean.
- Without Crowsnest running, the command runs a **quick check**: the malware list, what changed since the previous release, and the release's age. Start Crowsnest for the full check, which adds look-alike names, invented names and registry history.
- Names and versions are checked for plain characters before anything reaches your shell, so a name such as `@scope/name` with a version such as `^1.2.0` is accepted without quoting.
- Only `crowsnest install` is checked. A plain `npm install` is not.

## Check a pull request

```bash
crowsnest check --base origin/main
```

This compares the project's lockfiles with how they were at the base, then checks only the versions that are new or changed. It reads npm, pnpm, Yarn, Poetry, uv, Pipenv, pip (`requirements.txt` with exact versions), Composer, Bundler, Cargo and Go lockfiles. Leave `--base` out to check every version.

For a pull request that moves axios from 1.14.0 to 1.14.1:

```text
Checked 1 package version(s) changed since main.
✖ axios@1.14.1 (was 1.14.0)
     !!  ACTIVE IOC: axios@1.14.1 is listed as malicious (MAL-2026-2307)
1 version(s) should not be merged.
```

It exits with 3 when a version should not be merged, so it can fail a build. The folder must be a git repository.

With Crowsnest running, `check` uses the full check. Without it, it falls back to a quick check that reads `package-lock.json` only, says which other lockfiles it skipped, and, without `--base`, checks only the malware list.

### In GitHub

The same check runs as a GitHub Action, with no server to set up:

```yaml
name: Dependency check
on: pull_request

jobs:
  crowsnest:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: devampatel03/Crowsnest/.github/actions/dependency-check@main
```

The job fails when the pull request adds a version Crowsnest would not let you install, and writes an error for each one in the run log.

| Input | Meaning |
|---|---|
| `path` | The project folder. |
| `base` | The git ref to compare with. Defaults to the pull request's base. |
| `min-release-age` | Days to wait; `0` turns it off. |
| `crowsnest-ref` | The Crowsnest version to run. |

Pin `crowsnest-ref`, and the action itself, to a release or a commit you trust instead of `main`.

To run the check yourself with no server, run `python -m packages.core.checks <folder> --base origin/main` from the Crowsnest folder. It exits with 1 when a version should not be merged and 2 if it could not run. Add `--fail-on-degraded` to also fail when a lookup could not be made, and `--offline` to skip online lookups.

## How risk is worked out

`crowsnest install` adds points for each warning sign it finds, up to 1.00:

| Warning sign | Points |
|---|---|
| Registered less than 30 days ago | 0.40 |
| Fewer than 1,000 downloads a week | 0.30 |
| No link to a code repository | 0.20 |
| Name is one or two letters from a package with over 1,000,000 weekly downloads | 0.35 |

It also adds points for a package it has no data on (0.20), for names AI assistants are known to invent, for a release that looks hijacked, and for threat alerts from Socket when you set a key. A version on the malicious-package list, or younger than the minimum release age, always stops.

A total of 0.6 or above stops the install. The VS Code extension starts showing a warning at 0.5 by default.

## Replay an earlier day

```bash
crowsnest replay --date 2026-05-11
```

This runs a check against a saved snapshot of an earlier day. `--ioc <name>` picks a named campaign and `-f json` prints the raw result. It is a terminal feature only; the dashboard does not offer it. A date with no snapshot may return nothing.

## Watch live events

```bash
crowsnest watch
```

Streams live events until you stop it. For alerts in Slack, use the [Slack bot](/docs/integrations/slack).

## Save settings

```bash
crowsnest config get
crowsnest config set apiUrl http://localhost:8000
```

| Key | Purpose |
|---|---|
| `apiUrl` | Where Crowsnest is running. |
| `githubToken` | Optional. Repository details. |
| `npmToken` | Optional. Registry lookups. |
| `socketApiKey` | Optional. Threat alerts from Socket. |
| `anthropicApiKey` | Optional. AI-assisted analysis. |

A saved value beats the matching environment variable. `config get` shows secrets as `***set***` or `(not set)`.

## Limits

- `scan` runs once. Run it again yourself or from a scheduler; `watch` streams events and is a different command.
- The 0.6 stop limit is fixed.
- A package Crowsnest cannot find in any registry adds 0.2 risk and still goes to npm, which then reports that it does not exist.
- `check` compares lockfiles, so a dependency named only in `package.json`, or an unpinned `requirements.txt` line, is not checked.
- A plain `npm install` or `pip install` is not checked. For other ecosystems, use `check` on the pull request.

See also [Configuration](/docs/configuration), [Using the dashboard](/docs/dashboard) and the [VS Code extension](/docs/integrations/vscode).
