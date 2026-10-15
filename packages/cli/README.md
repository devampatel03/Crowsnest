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

## You also need a Crowsnest backend

The CLI is a thin client. The checks run in the Crowsnest backend, which runs on your own machine. Follow the
[quickstart in the main README](https://github.com/devampatel03/Crowsnest#quickstart) to start it (it listens on
`http://localhost:8000` by default). It works without any API keys.

If your backend lives somewhere else:

```bash
crowsnest config set apiUrl http://my-host:8000
```

## Commands

| Command | What it does |
| --- | --- |
| `crowsnest scan [path]` | Scan a project's lockfile. `-f json` for machine output, `--watch` to repeat every 5 minutes. |
| `crowsnest investigate <package>` | Look closely at one package. `--deep` runs follow-up checks. |
| `crowsnest install <package>` | A safe `npm install`: stops on a risky package. `--crowsnest-acknowledge-risk` overrides. |
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
