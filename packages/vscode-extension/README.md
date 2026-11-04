# Crowsnest: Risky Package Warnings

Crowsnest marks the `import` and `require` lines in your code when they name a package that looks risky. A coloured
dot appears in the gutter and the line gets a wavy underline. Hover over it to read why.

It looks for four things that a normal vulnerability scanner does not:

- names that are one typo away from a popular package
- names an AI assistant made up, which someone may have registered since
- packages whose publisher or build files changed recently, a common sign of a hijacked account
- packages that are only a few days old and have almost no history

| Dot | Score |
| --- | --- |
| Red | above 80% |
| Orange | above 60% |
| Yellow | above your threshold (50% unless you change it) |

Imports with nothing wrong get no mark. Node built-ins such as `fs` and `node:path`, and Python's standard library, are
skipped. The extension reads JavaScript, TypeScript, JSX, TSX and Python files. Python imports are checked against
PyPI and everything else against npm.

## Set it up

The extension only displays results. The checking happens in a small service that runs on your own computer, so you
need that running first. You need [Docker](https://www.docker.com/products/docker-desktop/) and Node.js 20 or newer.

```bash
npm install -g @crowsnest/cli
crowsnest start
```

`crowsnest start` downloads the service the first time (about 430 MB) and then runs it at `http://localhost:8000`,
which is where the extension looks. No account or API key is needed. To stop it, run `crowsnest stop`.

If the service is not running, the status bar shows **Crowsnest (offline)**, nothing is marked, and the rest of VS Code
carries on as normal.

## Commands

Open the Command Palette with `Ctrl+Shift+P` (`Cmd+Shift+P` on a Mac) and type "Crowsnest".

- **Crowsnest: Scan Current File** lists every package in the file with its score, in the Crowsnest output panel.
- **Crowsnest: Investigate Package Under Cursor** opens a full report on one package.
- **Crowsnest: Open Dashboard** opens the dashboard that runs on your machine.

## Settings

| Setting | Default | Meaning |
| --- | --- | --- |
| `crowsnest.apiUrl` | `http://localhost:8000` | Where the service runs |
| `crowsnest.dashboardUrl` | `http://localhost:3000` | Where the dashboard runs |
| `crowsnest.enabled` | `true` | Turns the marks on or off |
| `crowsnest.riskThreshold` | `0.5` | Only mark packages scoring above this, from 0 to 1 |

## What it sends

Only package names (for example `lodash`) and whether each is an npm or a PyPI package, and only to the service you
configured. Your code and file paths are never sent. It also asks that service for its status once a minute. There are
no other network requests and no usage tracking. With the default settings the service is on your own computer.

## Links

[Source code and issue tracker](https://github.com/devampatel03/Crowsnest). Licensed under Apache-2.0.
