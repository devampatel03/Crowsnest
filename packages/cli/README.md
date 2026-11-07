# @crowsnest/cli

The terminal command for [Crowsnest](https://github.com/devampatel03/Crowsnest), a lookout for what you install. It
checks your project's packages and gives each one a plain call: **Clear**, **Watch** or **Hold**. A Hold means stop and
look before you install it or keep it.

## Install

```bash
npm install -g @crowsnest/cli
crowsnest --help
```

Install with **`-g`**. This is a command, and without `-g` npm leaves it in the current folder's `node_modules`, where
your shell will not find it. The install box on the right of the npm page leaves `-g` out, so copy the line above.

If you see `crowsnest: command not found`, or "not recognized" on Windows, you most likely installed without `-g`. Run
the line above, or try it once with no install: `npx @crowsnest/cli doctor`. If the command is still missing after a
global install, open a new terminal window.

Needs Node.js 20 or newer.

## You need Docker to run Crowsnest

The checks run in the Crowsnest backend, on your own machine, and Docker is the easy way to run it. One command
downloads it the first time and starts it:

```bash
crowsnest start                         # shares the current folder with it, read only
crowsnest scan .
crowsnest stop
```

`crowsnest start --projects <folder>` shares a different folder. Crowsnest can read only inside the folder you share, and
it listens on this machine and nowhere else. It works without API keys, and what it stores is kept between runs
(`crowsnest stop --delete-data` removes it). If something is off, `crowsnest doctor` checks Docker, the backend and the
internet lookups, and says how to fix what it finds.

`crowsnest install` and `crowsnest check` also work without the backend. They fall back to a quick check: the public
malware list, what changed since the previous release, and how new the release is (`package-lock.json` only, for
`check`). They tell you when they did. Start the backend for the full check and for every other command.

No Docker? Run the backend from source, following the
[main README](https://github.com/devampatel03/Crowsnest#quickstart). If your backend lives somewhere else:

```bash
crowsnest config set apiUrl http://my-host:8000
```

## Commands

| Command | What it does |
| --- | --- |
| `crowsnest start` | Start the backend in Docker. `--projects <folder>` to share another folder, `--port <port>`, `--env-file <file>` for optional keys. |
| `crowsnest stop` | Stop it. `--delete-data` also deletes what it stored. |
| `crowsnest doctor` | Check Docker, the backend and the internet lookups, and say how to fix problems. |
| `crowsnest check [path]` | Vet only the versions a pull request adds (`--base <ref>`). Exits 3 when one should not be merged. |
| `crowsnest scan [path]` | Scan a project's lockfile. `-f json` for machine output. |
| `crowsnest investigate <package>` | Look closely at one package. `--deep` runs follow-up checks. |
| `crowsnest install <package>` | A safe `npm install`: stops on a risky package. `--crowsnest-acknowledge-risk` overrides, `--strict` refuses when a check could not be completed, `--quick` / `--full` choose the check. |
| `crowsnest blast-radius` | What breaks if a maintainer's account is taken over. `-m <login>` or `--all`. |
| `crowsnest replay` | Replay a known past incident (`--ioc <name>`, `--date <YYYY-MM-DD>`). |
| `crowsnest watch` | Stream live events to the terminal. |
| `crowsnest config get/set` | Show or change settings. |

## Settings

Set with `crowsnest config set <key> <value>`, or with an environment variable. A value saved with `config set`
wins over the environment variable.

| Key | Environment variable | Default |
| --- | --- | --- |
| `apiUrl` | `CROWSNEST_API_URL` | `http://localhost:8000` |
| `githubToken` | `GITHUB_TOKEN` | none |
| `npmToken` | `NPM_TOKEN` | none |
| `socketApiKey` | `SOCKET_API_KEY` | none |
| `anthropicApiKey` | `ANTHROPIC_API_KEY` | none |

Every key is optional. Without one, Crowsnest falls back to saved data.

`config set` saves values as plain text in your user config folder. On a shared machine, use environment variables for
secrets.

## Licence

Apache-2.0. See `LICENSE`.
