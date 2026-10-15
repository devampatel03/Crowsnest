# Crowsnest: Supply Chain Sentinel

See a risky package before it reaches your lockfile. Crowsnest puts a coloured dot in the gutter and a wavy
underline on any `import` or `require` line that names a package that looks wrong, and tells you why when you hover.

It catches the things ordinary vulnerability scanners miss:

- **Look-alike names** that imitate a popular package and wait for a typing mistake.
- **Made-up packages**, the names an AI assistant invented that an attacker can then register.
- **Hijacked packages**, where a new publisher appears or build files change.
- **Brand-new packages** with almost no history.

| Dot | Meaning |
| --- | --- |
| Red | Critical: score above 80% |
| Orange | High: above 60% |
| Yellow | Medium: above your threshold (50% by default) |

Imports that look fine get no mark at all. Node built-ins (`fs`, `node:path`) and the Python standard library are
skipped.

Works in JavaScript, TypeScript, React (`.jsx`, `.tsx`) and Python files. Python imports are checked against PyPI,
the rest against npm.

## You need the Crowsnest backend

This extension is a viewer. The checks run in the Crowsnest backend on your own machine, free and open source, with
no account and no API keys required. Start it by following the
[quickstart](https://github.com/devampatel03/Crowsnest#quickstart). It listens on `http://localhost:8000`, which
is what the extension expects.

If the backend is not running, the status bar shows **Crowsnest (offline)**, nothing is flagged, and nothing breaks.

## Commands

Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

- **Crowsnest: Scan Current File** lists every package in the file with its score in the Crowsnest output panel.
- **Crowsnest: Investigate Package Under Cursor** opens a full report for one package.
- **Crowsnest: Open Dashboard** opens the dashboard on your machine.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| `crowsnest.apiUrl` | `http://localhost:8000` | Where the backend runs. |
| `crowsnest.dashboardUrl` | `http://localhost:3000` | Where the dashboard runs. |
| `crowsnest.enabled` | `true` | Turn the inline marks on or off. |
| `crowsnest.riskThreshold` | `0.5` | Only mark packages scoring above this (0 to 1). |

## Privacy

The extension sends only package names, such as `lodash`, and whether each is an npm or PyPI package, to the backend
you configured. It never sends your code or file paths. It also asks that same backend for its status every minute.
It makes no other network requests and collects no usage data. With the default settings the backend is on your own
machine.

## Links

[Source and issues](https://github.com/devampatel03/Crowsnest) · Apache-2.0 licence
