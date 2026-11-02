# @crowsnest/cli

Command-line front end for [Crowsnest](https://github.com/devampatel03/Crowsnest), a free, open-source lookout for
the packages you install. It checks a project's dependencies and gives each one a plain call: **Clear**, **Watch**
or **Hold**.

## Install

```bash
npm install -g @crowsnest/cli
crowsnest --help
```

Needs Node.js 18 or newer.

## You need Docker to run Crowsnest

The checks run in the Crowsnest backend, on your own machine, and the easiest way to run it is Docker. One command
downloads it (once) and starts it:

```bash
crowsnest start                         # shares the current folder with it, read only
crowsnest scan .
crowsnest stop
```

`crowsnest start --projects <folder>` shares a different folder. Crowsnest can only read inside the folder you share,
and it never listens on your network, only on this machine. It works without any API keys, and your stored data is kept
between runs (`crowsnest stop --delete-data` removes it). `crowsnest doctor` checks Docker, the backend and the internet
lookups and says how to fix what is wrong.

`crowsnest install` and `crowsnest check` also work **without** the backend. They fall back to a quick check (the public
malware list, what changed since the previous release, and release age; `package-lock.json` only for `check`) and say
that they did. Start the backend for the full check and for every other command.

Without Docker, run the backend from source with the
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
| `crowsnest scan [path]` | Scan a project's lockfile. `-f json` for machine output, `--watch` to repeat every 5 minutes. |
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

All keys are optional. Without them Crowsnest falls back to cached data.

Values saved with `config set` are stored in plain text in your user config folder. Prefer environment variables
for secrets on shared machines.

## Licence

Apache-2.0. See `LICENSE`.
