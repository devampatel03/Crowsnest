---
title: Crowsnest 0.1.0 release notes
h1: Crowsnest 0.1.0 release notes.
description: "Release notes for Crowsnest 0.1.0: the dashboard, the safe-install command, the Slack bot and the VS Code extension, plus what it cannot do yet."
slug: crowsnest-0-1-0-release-notes
order: 4
published: 2026-10-07
updated: 2026-10-08
status: draft-until-tagged
author: Crowsnest contributors
dek: What is in version 0.1.0 while it is in development, and what it cannot do yet.
question: What is in Crowsnest 0.1.0?
answer: Crowsnest 0.1.0 is in development and has no release tag yet. It includes a dashboard, a safe-install command, a Slack bot and a VS Code extension. It is free, open source and runs on your machine. It is early, so the limits below are real.
facts:
  - "Status: unreleased and in development; there is no release tag or release date yet (2026-10-07)."
  - "The API, command line tool and VS Code extension all report version 0.1.0 (2026-10-07)."
  - "Four ways to use it: dashboard, command line, Slack bot and VS Code extension (repository packages, 2026-10-07)."
  - "Licence: Apache-2.0 (LICENSE file, 2026-10-07)."
related:
  - /docs/quickstart
  - /blog/what-is-slopsquatting
  - /docs/contributing
  - /docs
---

Crowsnest 0.1.0 is in development and has no release tag yet. It includes a dashboard, a safe-install command, a Slack bot and a VS Code extension. It is free, open source and runs on your machine. It is early, so the limits below are real.

These notes describe the code as it stands on 2026-10-07. There is no release date. This page will be updated when a GitHub release is tagged.

## What is in it?

- **Dashboard.** Four pages: Horizon (what needs your attention), Lookout (who maintains your packages), Hold (what is installed) and Log (everything Crowsnest has called). Live updates, no login. See [Using the dashboard](/docs/dashboard).
- **Command line.** `crowsnest scan`, `investigate`, `blast-radius`, `replay`, `watch`, `install` and `config`. `crowsnest install` stops installs at risk 0.6 or above. See [CLI usage](/docs/cli).
- **Slack bot.** Posts the most serious calls to a channel and answers four commands. See [Slack bot](/docs/integrations/slack).
- **VS Code extension.** Margin warnings on imports in JavaScript, TypeScript and Python files. See [VS Code extension](/docs/integrations/vscode).
- **Plain calls.** Every finding is a Clear, Watch or Hold with what happened and what to do.
- **Self-hosted.** Run it with Docker or from source. Every API key is optional. Apache-2.0.

## How do I get it?

Follow the [Quickstart](/docs/quickstart). The command line tool and the VS Code extension are built from source. Neither is published: not on npm, not on the VS Code Marketplace.

## What are the known limits?

- A scan on a fresh install with no API keys can fail in 0.1.0 (seen 2026-10-07). See [Troubleshooting](/docs/troubleshooting).
- The Docker image does not include the built-in lists of known harmful packages and known AI-invented names, so those checks do nothing there. From source they load.
- Only installs run as `crowsnest install` are checked; a plain `npm install` is not.
- The 0.6 install stop is fixed and cannot be changed.
- If Crowsnest cannot be reached, `crowsnest install` warns and installs anyway.
- A package Crowsnest has no data on adds 0.2 risk and still installs.
- npm projects get the most checks; coverage for other kinds of project is thinner.
- It does not replace tools that track known security bugs, such as Dependabot or Snyk.
- It cannot see an attack that has left no public trace yet.
- `crowsnest scan --watch` is listed but does not repeat the scan yet.
- The dashboard has no login. Keep it on your own machine or network.
- To scan a folder from the Docker setup, you must share that folder with the container.
- There is no hosted version.

## What this does not do

These notes do not promise a date or a feature list for the next version. They also do not claim any fix beyond what the code does today. Check the repository for current state.

Found a rough edge? Open an issue on [GitHub](https://github.com/devampatel03/Crowsnest/issues/new/choose), and read [Contributing](/docs/contributing). To learn what the safe-install check is for, read [What is slopsquatting?](/blog/what-is-slopsquatting).

**Found a rough edge? Tell us. Version 0.1.0 expects them.**
