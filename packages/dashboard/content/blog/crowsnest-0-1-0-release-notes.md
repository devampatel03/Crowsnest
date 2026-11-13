---
title: Crowsnest 0.1.0 release notes
h1: Crowsnest 0.1.0 release notes.
description: "Release notes for Crowsnest 0.1.0: the dashboard, the terminal command, the VS Code extension and the Slack bot, what 0.1.1 to 0.1.3 changed, and its limits."
slug: crowsnest-0-1-0-release-notes
order: 4
published: 2026-11-03
updated: 2026-11-13
author: Crowsnest contributors
dek: What shipped in version 0.1.0, what changed in 0.1.1 to 0.1.3, and what Crowsnest cannot do yet.
question: What is in Crowsnest 0.1.0?
answer: Crowsnest 0.1.0 was released on 2026-11-03. It includes a dashboard, a terminal command on npm, a VS Code extension on the Marketplace and a Slack bot. It is free, open source and runs on your machine. It is early, so the limits below are real.
facts:
  - "Released 2026-11-03 as tag v0.1.0; version 0.1.1 followed on 2026-11-04, 0.1.2 on 2026-11-08 and 0.1.3 on 2026-11-12 (GitHub releases)."
  - "The terminal command is @crowsnest/cli on npm, and the VS Code extension is crowsnest.crowsnest-vscode on the Marketplace (npm registry and Marketplace, 2026-11-08)."
  - "The backend image is ghcr.io/devampatel03/crowsnest-api, and crowsnest start runs the image that matches the command's version (CLI source, 2026-11-08)."
  - "Four ways to use it: dashboard, command line, VS Code extension and Slack bot (repository packages, 2026-11-08)."
  - "Licence: Apache-2.0 (LICENSE file, 2026-11-08)."
related:
  - /docs/quickstart
  - /blog/what-is-slopsquatting
  - /docs/contributing
  - /docs
---

Crowsnest 0.1.0 was released on 2026-11-03. It includes a dashboard, a terminal command, a VS Code extension and a Slack bot. It is free, open source and runs on your machine. It is early, so the limits below are real.

## What is in it?

- **Dashboard.** Four pages: Horizon (what needs your attention), Lookout (who maintains your packages), Installed (what you have installed) and Log (everything Crowsnest has called). Live updates, no login. See [Using the dashboard](/docs/dashboard).
- **Terminal command.** `npm install -g @crowsnest/cli`, then `crowsnest start` runs the backend in Docker. It adds `scan`, `investigate`, `blast-radius`, `replay`, `watch`, `check`, `config`, `stop` and `doctor`. `crowsnest install` stops installs at risk 0.6 or above, on a version a public malware list names, and on a version younger than two days. `install` checks on every run that Crowsnest is running and stops with the way to start it if not (add `--quick` to install on the malware list and release age alone); `check` falls back to a quick check and says so. See [CLI usage](/docs/cli).
- **VS Code extension.** Margin warnings on imports in JavaScript, TypeScript and Python files, from the Marketplace. See [VS Code extension](/docs/integrations/vscode).
- **Slack bot.** Posts the most serious calls to a channel and answers four commands. It runs from the repository and is not published. See [Slack bot](/docs/integrations/slack).
- **Plain calls.** Every finding is a Clear, Watch or Hold with what happened and what to do.
- **Self-hosted.** Run it with Docker. Every API key is optional. Apache-2.0.

## How do I get it?

Follow the [Quickstart](/docs/quickstart). It covers the dashboard, which runs from the repository with Docker Compose, and the terminal command, which needs Node.js 20 or newer and Docker.

## What changed in 0.1.1?

Version 0.1.1 followed the next day. It made `crowsnest doctor` warn, not fail, when you simply have not started the backend. It renamed the VS Code extension to "Crowsnest: Risky Package Warnings" and made its hover text plainer. It fixed packaging of the extension, and it made the README files say that the command needs `-g` to install. The full list is in the [changelog](https://github.com/devampatel03/Crowsnest/blob/main/CHANGELOG.md).

## What changed in 0.1.2 and 0.1.3?

Version 0.1.2 fixed `crowsnest investigate`, which said a package was fine when `crowsnest install` blocked it. The command, the VS Code extension and the Slack bot now show the same answer. Version 0.1.3 made the dashboard start with `docker compose up` and made scanning a pick from a list: the scan dialog shows the projects in the folder you share, and one click scans one. `crowsnest install` now checks every time that Crowsnest is running, a scan reports everything it found each time, and the last emoji are gone from the command line and the VS Code extension. The full list is in the [changelog](https://github.com/devampatel03/Crowsnest/blob/main/CHANGELOG.md).

## What are the known limits?

- Only installs run as `crowsnest install` are checked; a plain `npm install` is not.
- The 0.6 install stop is fixed and cannot be changed.
- If Crowsnest cannot be reached, `crowsnest install` installs nothing and tells you to run `crowsnest start`. `--quick` installs on the public malware list and release age alone, and `--strict` refuses when any check could not be completed.
- A package Crowsnest has no data on adds 0.2 risk and still installs.
- npm projects get the most checks; coverage for other kinds of project is thinner.
- It does not replace tools that track known security bugs, such as Dependabot or Snyk.
- It cannot see an attack that has left no public trace yet.
- The dashboard has no login. Keep it on your own machine or network.
- The backend can only read the folder it shares with Docker, read only. Share the folder that holds your projects (`CROWSNEST_PROJECTS` for the dashboard, `crowsnest start --projects` for the command), and scan inside it.
- There is no hosted version.

## What this does not do

These notes do not promise a date or a feature list for the next version. Check the repository for current state.

Found a rough edge? Open an issue on [GitHub](https://github.com/devampatel03/Crowsnest/issues/new/choose), and read [Contributing](/docs/contributing). To learn what the safe-install check is for, read [What is slopsquatting?](/blog/what-is-slopsquatting).
