---
title: CLI usage
description: "Use the crowsnest command to scan a project, check one package, vet a pull request and stop risky installs. Commands, options and exit codes for your terminal."
slug: cli
order: 4
section: Use
updated: 2026-10-31
question: How do I use the crowsnest command?
answer: Run crowsnest scan to check a project, crowsnest investigate to check one package, crowsnest install to check before npm installs, and crowsnest check to vet the packages a pull request adds. Install and check exit with 3 when they stop something. A scan exits with 1 when it finds something, so it works in a build check.
facts:
  - "Eleven commands: start, stop, doctor, scan, investigate, blast-radius, replay, watch, install, check and config (crowsnest --help, 2026-10-31)."
  - "Without Crowsnest running, install and check use a quick check: the public malware list, release changes against the previous version, and release age; --quick and --full choose a mode (CLI source, 2026-10-31)."
  - "crowsnest start runs the backend in Docker, listening on this machine only, and shares one folder with it read only; stored data is kept in a Docker volume (CLI source, 2026-10-31)."
  - "Install stops at risk 0.6 or above, shown as 60 percent in the terminal; that limit is fixed. It also stops a version a public malware list names, and a version younger than two days unless you change that (install check, 2026-10-24)."
  - "Exit codes: scan returns 0 when clean, 1 when it finds something, 2 when it fails; a stopped install or check returns 3 (CLI source, 2026-10-24)."
  - "Scan checks for completion every 2 seconds (CLI source, 2026-10-07)."
  - "Version 0.1.0 (crowsnest --version, 2026-10-07)."
related:
  - /docs/installation
  - /docs/configuration
  - /docs/dashboard
  - /docs/troubleshooting
---

The `crowsnest` command scans a project, checks one package, vets pull requests, and stops risky installs. Most commands need Crowsnest running on port 8000 (`crowsnest start` runs it); `install` and `check` also work without it, as a quick check. A scan exits with 1 when it finds something, which makes it usable in a build check.

## What do I need first?

Install the command ([Installation](/docs/installation)), then start Crowsnest. With Docker installed, one command does it:

```bash
crowsnest start
```

It downloads Crowsnest the first time, starts it on port 8000 and shares the current folder with it, read only. Share a different folder with `crowsnest start --projects /path/to/folder`; Crowsnest can only read inside it, so scan folders within it. Stop it with `crowsnest stop` (your stored data is kept; add `--delete-data` to remove it). If something does not work, `crowsnest doctor` checks Docker, Crowsnest and the internet lookups and says how to fix what it finds. You can also start Crowsnest another way ([Quickstart](/docs/quickstart)).

From source, replace `crowsnest` below with `node dist/index.js`, run from `packages/cli`. Run `crowsnest --help` for the command list, or `crowsnest <command> --help` for one command.

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

Exit codes: **0** nothing found, **1** one or more problems found, **2** the scan failed. With `-f json` the command prints the result and exits 0 even when problems were found, so read the output instead of the exit code. If you started Crowsnest with `crowsnest start`, scan a folder inside the one you shared; any other folder is refused with a message saying how to share it. With the Docker Compose setup, the path must be one the Crowsnest service can see (see the [Quickstart](/docs/quickstart)).

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
crowsnest install some-package@^1.2.0
```

Crowsnest works out the one version npm would install, checks that exact version, prints the result, then installs that same version for you if the check passes. A range such as `^1.2.0` is resolved first, so the version that was checked is always the version that is installed.

A version is stopped when:

- A public list of malicious packages names it. Crowsnest checks the OpenSSF malicious-packages list, through OSV.dev, for the exact version.
- Its release looks hijacked. Crowsnest compares it with the previous release and looks for a changed build repository, dropped build proof, a new publisher, an added install script or dependency, a sudden size jump, or a package that was silent for a year.
- It was published less than two days ago. Every compromise in the 2026 incident replays was removed from its registry within three hours, so waiting two days keeps them out. Change the wait with `--min-release-age <days>`, or use `0` to turn it off.
- Its risk is 0.6 (60 percent) or above. See the table below.

Real output on 2026-10-24, for a version on the malicious list (nothing is installed):

```text
- Checking axios before install...
✖ Blocked: axios@1.14.1

════════════════════════════════════════════════════════
[crowsnest] ⛔ BLOCKED: axios@1.14.1
[crowsnest]
[crowsnest]   🚨  ACTIVE IOC: axios@1.14.1 is listed as malicious (MAL-2026-2307)
[crowsnest]
[crowsnest]   Risk score:  100%
[crowsnest]
[crowsnest]   To override (risk accepted):
[crowsnest]     crowsnest install axios@1.14.1 --crowsnest-acknowledge-risk
════════════════════════════════════════════════════════
```

A stopped install exits with 3. To install anyway, run the override line shown, and only after you have read the reasons.

- If Crowsnest could not look something up, the result says "Not checked" and names it, for example when the malware list cannot be reached. A lookup that failed is never shown as a clean result.
- If Crowsnest is not running, `crowsnest install` still checks the version with a **quick check** that needs nothing installed: the public malware list, what changed since the previous release, and how long the version has been public. It says "Quick check" when it does this. Start Crowsnest (`crowsnest start`) for the full check, which adds look-alike names, invented names and the registry's history. `--quick` uses the quick check even when Crowsnest is running, and `--full` refuses to run without Crowsnest.
- `--strict` refuses to install when any check could not be completed, for example when the malware list cannot be reached. Without it, Crowsnest installs on what it could check and says what it could not.
- Package names and versions are checked for plain characters before anything reaches your shell. Quote nothing: a name such as `left-pad` or `@scope/name`, with a version such as `1.2.3` or `^1.2.0`, is accepted.
- Only `crowsnest install` is checked. A plain `npm install` is not.

## How do I check a pull request?

```bash
crowsnest check --base origin/main
```

Compares the project's lockfiles with how they were at the base, then checks only the package versions that are new or changed. It reads npm, pnpm, Yarn, Poetry, uv, Pipenv, pip (`requirements.txt` with exact versions), Composer, Bundler, Cargo and Go lockfiles. Leave `--base` out to check every version in the lockfiles.

Real output on 2026-10-24, for a pull request that moves axios from 1.14.0 to 1.14.1:

```text
Checked 1 package version(s) changed since main.
⛔ axios@1.14.1 (was 1.14.0)
     🚨  ACTIVE IOC: axios@1.14.1 is listed as malicious (MAL-2026-2307)
1 version(s) should not be merged.
```

The command exits with 3 when a version should not be merged, so it can fail a build. The folder must be a git repository. With Crowsnest running it uses the full check. Without it, the command falls back to a quick check that reads `package-lock.json` only; it says which other lockfiles it did not read, and without `--base` it can check only the malware list. `--quick` and `--full` choose one or the other. The Docker image includes `git`, so the full check works against the Docker setup as long as the folder is one the Docker setup can see.

## How do I check pull requests in GitHub?

Crowsnest includes a GitHub Action that runs the same check with no server to set up:

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

The job fails when the pull request adds a version Crowsnest would not let you install, and it writes an error for each one in the run log. The action takes `path` (the project folder), `base` (the git ref to compare with; default is the pull request's base), `min-release-age` (days; `0` turns the wait off) and `crowsnest-ref` (the Crowsnest version to run). Pin `crowsnest-ref`, and the action itself, to a release or a commit you trust instead of `main`.

To run the same check yourself with no server, run `python -m packages.core.checks <folder> --base origin/main` from the Crowsnest folder. It exits with 1 when a version should not be merged and 2 if it could not run. Add `--fail-on-degraded` to also fail when a lookup could not be made, and `--offline` to skip online lookups.

## How is the install risk worked out?

`crowsnest install` adds up points for each warning sign it finds, up to a total of 1.00:

| Warning sign | Points |
|---|---|
| Registered less than 30 days ago | 0.40 |
| Fewer than 1,000 downloads a week | 0.30 |
| No link to a code repository | 0.20 |
| Name is one or two letters away from a package with over 1,000,000 weekly downloads | 0.35 |

Crowsnest also adds points for a package it has no data on (0.20), for names AI assistants are known to invent, for a release that looks hijacked, and for threat alerts from Socket when you set a key. A version on the malicious-package list always stops, and so does one that is younger than the minimum release age.

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
- A package Crowsnest cannot find in any registry adds 0.2 risk and still goes to npm, which then reports that it does not exist.
- `crowsnest check` compares lockfiles, so a dependency named only in `package.json` or an unpinned `requirements.txt` line is not checked.
- The built-in lists of known harmful packages and known AI-invented names are not included in the Docker image as of 2026-10-07 (checked: both lists were empty in a fresh container). Those two checks have nothing to match in the Docker setup. From source, the lists load from the project's seed folder.
- A scan on a fresh install can fail in 0.1.0 as of 2026-10-07. See [Troubleshooting](/docs/troubleshooting) for the exact message and what to do.
- It does not check a plain `npm install` or `pip install`. For other ecosystems, use `crowsnest check` on the pull request.

See also [Configuration](/docs/configuration), [Using the dashboard](/docs/dashboard) and the [VS Code extension](/docs/integrations/vscode).

**Make `crowsnest install` your habit. It is the only moment Crowsnest can stop a package before it arrives.**
