---
title: VS Code extension
description: "Get warnings in the margin of VS Code when you import a risky package. Install from source, use three commands, and set four options. JS, TS and Python."
slug: integrations/vscode
order: 7
section: Integrations
updated: 2026-10-07
howTo: true
question: How do I get Crowsnest warnings in VS Code?
answer: Build the extension from packages/vscode-extension, press F5 to open a development window, and open a JavaScript, TypeScript or Python file. Risky imports get a mark in the margin. It needs Crowsnest running on port 8000 and VS Code 1.85 or newer.
facts:
  - "Version 0.1.0; needs VS Code 1.85 or newer (packages/vscode-extension/package.json, 2026-10-07)."
  - "Switches on for JavaScript, TypeScript, JSX, TSX and Python files (package.json, 2026-10-07)."
  - "Three commands and four settings (package.json, 2026-10-13)."
  - "Waits 1,000 ms after you stop typing, and remembers each package's result for 5 minutes (src/decorator.ts, 2026-10-07)."
  - "Warning limit defaults to 0.5, lower than the install stop of 0.6 (package.json and install check, 2026-10-07)."
  - "Not published to the VS Code Marketplace (owner confirmation, 2026-10-07)."
related:
  - /docs/cli
  - /docs/configuration
  - /docs/troubleshooting
  - /docs/integrations/slack
---

The VS Code extension marks risky imports in the margin as you type. Hover to see why. It checks JavaScript, TypeScript and Python files. It needs Crowsnest running on port 8000 and VS Code 1.85 or newer.

## How do I install it?

It is not on the VS Code Marketplace, and no packaged `.vsix` file is provided. Run it from source:

1. **Open the folder** `packages/vscode-extension` in its own VS Code window.
2. **Build it.** In a terminal there, run:
   ```bash
   npm install
   npm run compile
   ```
3. **Press F5.** A second window opens, labelled Extension Development Host.
4. **Open a JavaScript, TypeScript or Python file** in that window. The extension switches on by itself.

## What will I see?

When you write an import for a package that scores at or above your warning limit, a mark appears in the margin of that line. Hover over it to read the reasons. The extension waits one second after you stop typing before it checks, and remembers each package's result for five minutes. Imports of things that ship with the language, such as `fs`, `node:path` or Python's `os`, are never checked, and Python imports are checked against PyPI.

## Which commands does it add?

Open the Command Palette to run them.

| Command | What it does |
|---|---|
| Crowsnest: Scan Current File | Checks every import in the open file. |
| Crowsnest: Investigate Package Under Cursor | Looks closely at one package. |
| Crowsnest: Open Dashboard | Opens the dashboard on your machine in your browser. |

## Which settings can I change?

Open Settings and search for "Crowsnest".

| Setting | Default | What it does |
|---|---|---|
| `crowsnest.enabled` | on | Turns the margin warnings on or off. |
| `crowsnest.apiUrl` | `http://localhost:8000` | Where Crowsnest is running. |
| `crowsnest.dashboardUrl` | `http://localhost:3000` | Where the dashboard runs on your machine. "Open Dashboard" opens its Horizon page. |
| `crowsnest.riskThreshold` | `0.5` | The risk, from 0 to 1, at which a warning starts to show. Raise it to see fewer. |

## What is worth knowing?

The warning limit (0.5) is lower than the install stop (0.6) on purpose, so you see a warning before an install would be blocked. If Crowsnest is not running, no marks appear.

## What this does not do

- It does not block anything. It marks lines; it never stops a save or an install.
- It does not warn about a package Crowsnest has no data on. Such a package scores only 0.2, which is under the default limit of 0.5.
- It does not check other languages. Only JavaScript, TypeScript and Python files switch it on.
- It does not work without Crowsnest running. See [Troubleshooting](/docs/troubleshooting) if no marks appear.

For the same check in your terminal, see [CLI usage](/docs/cli). Settings and keys are on the [Configuration](/docs/configuration) page, and the [Slack bot](/docs/integrations/slack) covers team alerts.

**A mark in the margin costs you a second. An install you regret costs more.**
