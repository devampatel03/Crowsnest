---
title: Introduction
description: "Learn what Crowsnest is, who it is for, and how to read a call: Clear, Watch or Hold. A plain introduction to a free, open-source package checker."
slug: introduction
order: 1
section: Get started
updated: 2026-10-08
question: What is Crowsnest?
answer: "Crowsnest is a free, open-source supply chain security tool that you run yourself. It checks the packages in your software project and gives each one a plain call: Clear, Watch or Hold. A Hold means stop and check before you install or keep it."
facts:
  - "Licence: Apache-2.0 (LICENSE file, 2026-10-07)."
  - "Current version: 0.1.0, reported by the health check on 2026-10-07."
  - "Four ways to use it: terminal, VS Code, Slack and the dashboard (repository packages, 2026-10-07)."
  - "Every API key is optional; without keys Crowsnest uses cached data (.env.example, 2026-10-07)."
  - "Lockfiles read: package-lock.json, pnpm-lock.yaml, yarn.lock, poetry.lock, Cargo.lock and go.sum (lockfile reader, 2026-10-07)."
related:
  - /docs/quickstart
  - /docs/dashboard
  - /docs/faq
  - /glossary
---

Crowsnest is a free, open-source supply chain security tool that you run yourself: it checks the packages in your software project and tells you, in plain words, which ones to hold back before they cause harm.

## Who is Crowsnest for?

Anyone who installs packages from npm or PyPI and wants a second opinion first. You do not need to be a security specialist. Crowsnest says what it found, how serious it is, and what to do next.

## What is a call?

Every package Crowsnest checks gets one of three calls.

- **Clear.** Crowsnest looked and found nothing.
- **Watch.** Something looks unusual. Look at it before you rely on it.
- **Hold.** Stop. Do not install it, or remove it, until you have checked.

A call always has the same shape: the word, what happened in one sentence, and what to do next. There is also a smaller grade, Note, for a minor flag. A package with no flags shows "No flags" in the dashboard. That is not the same as Clear: Clear only appears where Crowsnest checked that one package and found nothing.

## What does Crowsnest look at?

Who publishes a package, how new it is, how many people download it, whether it links to its source code, and whether its name is close to a famous one. It also watches for changes in who maintains a package, and for names an AI assistant might have invented. The glossary explains each attack in plain words: [slopsquatting](/glossary/slopsquatting), [typosquatting](/glossary/typosquatting), [dependency confusion](/glossary/dependency-confusion) and [maintainer takeover](/glossary/maintainer-takeover).

## Where do I use it?

| Place | What it does | Page |
|---|---|---|
| Terminal | Scans a project, checks one package, stops risky installs | [CLI usage](/docs/cli) |
| Dashboard | Shows every call with what to do about it | [Using the dashboard](/docs/dashboard) |
| Slack | Posts the most serious calls to a channel | [Slack bot](/docs/integrations/slack) |
| VS Code | Marks risky imports in the margin | [VS Code extension](/docs/integrations/vscode) |

## What this does not do

- It does not replace tools that track known security bugs, such as Dependabot or Snyk. Run it next to them.
- It cannot see an attack that has left no public trace anywhere yet.
- It does not stop a plain `npm install`. Only installs run as `crowsnest install <package>` are checked.
- It does not send your lockfile to Crowsnest's authors. Crowsnest runs on your machine and sends them no usage data.
- It needs setup: you run it yourself. There is no hosted version and no account.
- **It is early.** Version 0.1.0 can fail on a first scan with no keys. See [Troubleshooting](/docs/troubleshooting).

## Where do I go next?

Start with the [Quickstart](/docs/quickstart). If you already have a call in front of you, read [What to do when Crowsnest says Hold](/blog/what-to-do-when-crowsnest-says-hold). Questions are answered in the [FAQ](/docs/faq).

**Start with the Quickstart. It takes three commands.**
