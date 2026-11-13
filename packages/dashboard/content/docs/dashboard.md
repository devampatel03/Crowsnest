---
title: Using the dashboard
description: "Open the Crowsnest dashboard at localhost:3000 and read a call: what happened, how serious it is and what to do. Four pages, scanning and keyboard shortcuts."
slug: dashboard
order: 5
section: Use
updated: 2026-11-13
question: How do I read the Crowsnest dashboard?
answer: "Open http://localhost:3000. Each call says what happened, how serious it is and what to do next: read the sentence, then take the first step. Four pages cover what needs you, who maintains your packages, what is installed and everything Crowsnest has called."
facts:
  - "Dashboard address: http://localhost:3000, opening on Horizon; Crowsnest service: http://localhost:8000 (infra/docker-compose.yml, 2026-11-09)."
  - "Four pages: Horizon (/), Lookout (/lookout), Installed (/hold) and Log (/log) (dashboard app, 2026-11-09)."
  - "No login: anyone who can reach the page can read it; the Docker setup publishes it on this machine only (infra/docker-compose.yml, 2026-11-09)."
  - "Keyboard keys: / s r ? j k, and g followed by h, l, o or g (dashboard hotkeys, 2026-11-09)."
related:
  - /docs/quickstart
  - /docs/cli
  - /blog/what-to-do-when-crowsnest-says-hold
  - /glossary
---

## Before you start

The dashboard runs on your own machine at http://localhost:3000 and opens on Horizon. It reads from Crowsnest on port 8000, so start that first.

| Start it with | Command |
|---|---|
| Docker Compose | `docker compose up` from the Crowsnest folder |
| From source | `npm run dev` in `packages/dashboard` |

Compose starts the dashboard and Crowsnest together; the steps are in the [Quickstart](/docs/quickstart). `crowsnest start` runs Crowsnest only, with no dashboard, but both read the same backend, so whatever the terminal finds also shows here. If the status at the top right says Offline, see [Troubleshooting](/docs/troubleshooting).

The dashboard carries no website pages. Its Docs and help links open this website.

## The four pages

| Page | Address | What it answers |
|---|---|---|
| Horizon | `/` | What needs your attention now. |
| Lookout | `/lookout` | Who maintains your packages, highest risk first. |
| Installed | `/hold` | Everything in the projects you have scanned. |
| Log | `/log` | Every call Crowsnest has made, newest first. |

## Read a call

Each card has three parts.

| Part | What you see |
|---|---|
| What happened | One sentence in plain words, such as "The person who maintains this package changed recently." |
| How serious | A word and marks: Hold has three, Watch two, Note one. Hold marked "urgent" is the most serious. Below it, how sure Crowsnest is: Very sure, Fairly sure or Worth a look. |
| What to do | Numbered steps. The first is the one to take now. |

Under the sentence are the package, its version and when it was found. "Used in 3 projects" opens the list of projects that use it. **Show steps** expands the steps in place. Identical calls are grouped on Horizon as "Also found 2 more times"; Log keeps each one. For a worked example, read [What to do when Crowsnest says Hold](/blog/what-to-do-when-crowsnest-says-hold).

## Horizon

A sentence at the top gives the state, such as "All quiet from up here." or "2 packages need your attention." Under it are three numbers: Hold, Watch and Packages checked. Below are the five most serious calls, and **See all in Log** shows the rest. The chart at the bottom covers the last 30 days, with days that had a Hold marked in red.

## Lookout

A ranked list of the people who publish the packages you use, highest risk first. Risk runs from 0 (low) to 1 (high). Pick a name to see how many of your packages they maintain, how active they have been in the last 90 days and which of your projects would be affected. **Flagged** means the person is linked to known harmful activity. [Maintainer takeover](/glossary/maintainer-takeover) explains why that matters.

## Installed

Every package in your scanned lockfiles. Search with `/`, filter by kind of project and sort by status. Pick a row to see why the package is in your project, such as "brought in by a › b", its call, and **Check this package**, which gives the install check's answer (OK or Hold) with reasons. An integrity code and a download address sit on one line for support requests.

The page is called Installed because Hold is a verdict on a call, not a list of packages.

## Log

Everything Crowsnest has called. Filter by Hold, Watch or Note, search by name or choose a date range. Open a row for the full call.

## Scan a project

Press **Scan a project**, or press `s`, enter the folder and press **Scan**. The page says "Checking your packages…" and, when it finishes, "Done. 2 packages need your attention." with **See them →**.

The folder is read by the Crowsnest service, not by your browser. With Docker, the dialog lists the projects in the folder you share. Pick one, or type its name. To use your own projects, set `CROWSNEST_PROJECTS` ([Quickstart](/docs/quickstart)).

## Keyboard shortcuts

| Keys | Action |
|---|---|
| `/` | Focus search or filter |
| `s` | Scan a project |
| `r` | Refresh |
| `?` | Show shortcuts |
| `j` / `k` | Next / previous row |
| `g` then `h` | Go to Horizon |
| `g` then `l` | Go to Lookout |
| `g` then `o` | Go to Installed |
| `g` then `g` | Go to Log |

Shortcuts do nothing while you type in a box or have a dialog open.

## Where it runs

| | Address | Notes |
|---|---|---|
| Dashboard | http://localhost:3000 | Opens on Horizon. Docker Compose publishes it on this machine only. |
| Crowsnest | http://localhost:8000 | From source, set `NEXT_PUBLIC_API_URL` before `npm run dev` to use another address. |

Port 3000 taken? With Docker, change the first `3000` in `"127.0.0.1:3000:3000"` in `infra/docker-compose.yml`. From source, set `PORT` before `npm run dev`. Then add the new address to `CROWSNEST_CORS_ORIGINS` in `.env`, or the browser will be refused. Point the [Slack bot](/docs/integrations/slack) and [VS Code](/docs/integrations/vscode) at it too.

## Limits

- There is no login. Anyone who can reach the page can read it, so keep it on your own machine or network.
- It shows only what a scan has found. An empty page can mean you have not scanned yet.
- A lost connection is not hidden. The data stays on screen and is marked Stale.
- It does not offer replay, which is a terminal feature ([CLI usage](/docs/cli)).

See also the [glossary](/glossary) for any word on screen, and [Troubleshooting](/docs/troubleshooting) if the page says Offline.
