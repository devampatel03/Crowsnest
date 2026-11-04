# Crowsnest: Risky Package Warnings

A lookout for what you install, inside your editor. When an `import` or `require` line names a package that looks
wrong, Crowsnest puts a coloured dot in the gutter and a wavy line under it. Hover to read why.

It watches for what a plain vulnerability scanner does not:

- a name one typo away from a popular package
- a name an AI assistant made up, which someone may have registered since
- a publisher or build files that changed recently, which is how accounts get hijacked
- a package only a few days old with almost no history

| Dot | Score |
| --- | --- |
| Red | above 80% |
| Orange | above 60% |
| Yellow | above your threshold (50% unless you change it) |

An import with nothing wrong gets no mark. Node built-ins such as `fs` and `node:path`, and Python's standard library,
are skipped. It reads JavaScript, TypeScript, JSX, TSX and Python files. Python imports are checked against PyPI and
the rest against npm.

## Set it up

The extension shows results. The checking happens in a small service on your own computer, so start that first. You
need [Docker](https://www.docker.com/products/docker-desktop/) and Node.js 20 or newer.

```bash
npm install -g @crowsnest/cli
crowsnest start
```

The first `crowsnest start` downloads the service (about 430 MB), then runs it at `http://localhost:8000`, which is
where the extension looks. You need no account and no API key. `crowsnest stop` stops it.

If the service is not running, the status bar says **Crowsnest (offline)**, nothing is marked, and the rest of VS Code
carries on as usual.

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
