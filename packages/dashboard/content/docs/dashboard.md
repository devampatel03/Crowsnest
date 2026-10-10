---
title: Using the dashboard
description: "Read a Crowsnest call in the dashboard: what happened, how serious it is and what to do. A guide to Horizon, Lookout, Hold and Log, plus shortcuts."
slug: dashboard
order: 5
section: Use
updated: 2026-10-08
question: How do I read the Crowsnest dashboard?
answer: "Each call has three parts: what happened in one sentence, how serious it is, and what to do next. Read the sentence, then take the first step. The dashboard has four pages, Horizon, Lookout, Hold and Log, and opens at localhost:3000."
facts:
  - "Four pages: Horizon, Lookout, Hold and Log (dashboard app, 2026-10-07)."
  - "Default address: http://localhost:3000 (infra/docker-compose.yml, 2026-10-07)."
  - "No login: anyone who can reach the page can read it (dashboard app, 2026-10-07)."
  - "Keyboard keys: / s r ? j k, and g followed by h, l, o or g (dashboard hotkeys, 2026-10-07)."
related:
  - /docs/quickstart
  - /docs/cli
  - /blog/what-to-do-when-crowsnest-says-hold
  - /glossary
---

The dashboard answers three questions in order: what needs you, how serious it is, and what to do. Open it at http://localhost:3000. It has four pages: Horizon, Lookout, Hold and Log.

## How do I read a call?

Each card has three parts.

1. **What happened.** One sentence in plain words, such as "The person who maintains this package changed recently."
2. **How serious.** A word and three marks. Hold has three filled marks, Watch has two, Note has one. Hold with "urgent" is the most serious. Below it you see how sure Crowsnest is: Very sure, Fairly sure, or Worth a look.
3. **What to do.** The first step is the one to take now. More steps follow.

Under the sentence you see the package, its version, and when it was found. "Used in 3 projects" opens a list of your projects that use it. **Show steps** expands the steps in place, and **Hide steps** closes them. Identical calls are grouped on Horizon with "Also found 2 more times". Log keeps each one. For a full walkthrough of a Hold, read [What to do when Crowsnest says Hold](/blog/what-to-do-when-crowsnest-says-hold).

## What does Horizon show?

What needs your attention. A sentence at the top tells you the state, such as "All quiet from up here." or "2 packages need your attention." Three numbers sit under it: Hold, Watch and Packages checked. Below are the five most serious calls. **See all in Log** shows the rest. The chart at the bottom shows the last 30 days, with days that had a Hold marked in red.

## What does Lookout show?

Who maintains your packages. It is a ranked list of the people who publish the packages you use, highest risk first. Risk runs from 0 (low) to 1 (high). Pick a name to see how many of your packages they maintain, how active they have been in the last 90 days, and which of your projects would be affected. A person marked **Flagged** is linked to known harmful activity. See [maintainer takeover](/glossary/maintainer-takeover) for why this matters.

## What does Hold show?

What is installed. Every package in your scanned lockfiles appears here. Search with `/`, filter by kind of project, and sort by status. Pick a row to see why it is in your project, such as "brought in by a › b", its call, and **Check this package**, which gives the install check's answer (OK, or Hold) with reasons. Small technical details, such as an integrity code and a download address, sit in one line for support requests.

The page named Hold lists packages. A Hold call is a warning. They share a word, so read the heading to know which you are on.

## What does Log show?

Everything Crowsnest has called, newest first. Filter by Hold, Watch or Note, search by name, or choose a date range. Open a row for the full call.

## How do I start a scan?

Press **Scan a project**, or press `s`. Enter the folder, then press **Scan**. The page says "Checking your packages…" and, when done, "Done. 2 packages need your attention." followed by **See them →**. The folder is read by the Crowsnest service, not by your browser. With Docker, share the folder first (see the [Quickstart](/docs/quickstart)).

## Which keys work?

| Keys | Action |
|---|---|
| `/` | Focus search or filter |
| `s` | Scan a project |
| `r` | Refresh |
| `?` | Show shortcuts |
| `j` / `k` | Next / previous row |
| `g` then `h` | Go to Horizon |
| `g` then `l` | Go to Lookout |
| `g` then `o` | Go to Hold |
| `g` then `g` | Go to Log |

Shortcuts do nothing while you type in a box or have a dialog open.

## What this does not do

- It does not ask you to log in. Anyone who can reach the page can read it. Keep it on your own machine or network.
- It shows only what a scan has found. An empty page can mean you have not scanned yet.
- It does not hide a lost connection. If the live connection drops, it keeps the data on screen and marks it Stale.
- It does not offer replay. Replay is a terminal feature, described on the [CLI usage](/docs/cli) page.

Questions about a word on screen? Look it up in the [glossary](/glossary), or see [Troubleshooting](/docs/troubleshooting) if the page says Offline.

**Read the sentence, then the first step. That is the whole job.**
