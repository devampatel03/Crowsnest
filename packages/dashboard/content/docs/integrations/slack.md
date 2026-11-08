---
title: Slack bot
description: "Set up the Crowsnest Slack bot with one guided command. It posts serious calls to a channel and answers four slash commands, with no public web address needed."
slug: integrations/slack
order: 6
section: Integrations
updated: 2026-11-09
howTo: true
question: How do I set up the Crowsnest Slack bot?
answer: Run npm run setup in packages/slack-bot. It opens Slack with the app pre-filled, checks the two keys you paste, sends a test message and saves everything to .env. Then run npm run dev. The bot posts only the most serious calls to #security by default. No public web address is needed.
facts:
  - "Four slash commands: /crowsnest-scan, /crowsnest-investigate, /crowsnest-blast-radius, /crowsnest-status (slack-bot source, 2026-11-09)."
  - "Posts only the most serious calls, which the product shows as Hold (slack-bot source, 2026-11-09)."
  - "Default channel: #security, set with CROWSNEST_ALERT_CHANNEL (slack-bot source, 2026-11-09)."
  - "Two Slack keys are needed: SLACK_BOT_TOKEN and SLACK_APP_TOKEN. The signing secret is not used in Socket Mode (slack-bot source, 2026-11-09)."
  - "Default Crowsnest address: http://localhost:8000; default dashboard address: http://localhost:3000 (slack-bot source, 2026-11-09)."
related:
  - /docs/configuration
  - /docs/dashboard
  - /docs/troubleshooting
  - /docs/cli
---

## Before you start

| You need | Why |
|---|---|
| A Slack workspace where you may add apps | The bot is a Slack app you create once. |
| Crowsnest running on port 8000 | The bot asks it for every answer. |
| Node.js 20 or newer | The bot is built from source; it is not in a package store. |

The bot connects out to Slack, so there is no public web address to set up and no signing secret.

## Set it up

The guided setup takes about three minutes.

1. **Run the setup.** From the Crowsnest folder:

   ```bash
   cd packages/slack-bot
   npm install
   npm run setup
   ```

2. **Create the app.** Setup opens Slack's "create app from manifest" page with every permission and slash command already filled in. Pick a workspace and click **Create**.
3. **Paste two keys.** Setup checks each one with Slack as you paste it.
4. **Choose a channel.** Setup posts a test message there and saves the keys to the `.env` file in the Crowsnest folder.
5. **Start the bot.** Run `npm run dev`.

| Key | Where to find it |
|---|---|
| Bot key (`xoxb-...`) | The app's OAuth & Permissions page, after you click Install to Workspace. |
| App key (`xapp-...`) | Basic Information, App-Level Tokens, with the `connections:write` permission. |

Run `npm run doctor` any time to check the keys, permissions and the backend without changing anything. If Slack refuses to connect, the bot prints what went wrong in plain words and points to this command.

### Setting it up by hand

Create the app from `packages/slack-bot/slack-app-manifest.json` (Slack, Your Apps, Create New App, From a manifest), install it, and put the two keys in `.env`:

```env
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
CROWSNEST_ALERT_CHANNEL=#security
```

The manifest includes the `chat:write.public` permission, so the bot can post in any public channel without being invited. For a private channel, invite it with `/invite @Crowsnest`.

## Commands

| Command | What it does |
|---|---|
| `/crowsnest-scan /path/to/project` | Scans a project and posts the result. With no path it scans `/tmp/project`, which is rarely what you want, so always give one. |
| `/crowsnest-investigate left-pad` | Checks one package. |
| `/crowsnest-blast-radius some-login` | Lists what is affected if one publisher is compromised. A leading `@` is fine. |
| `/crowsnest-status` | Shows how many packages Crowsnest has checked and how many serious calls are open. |

The path in `/crowsnest-scan` is read by the Crowsnest service, so with Docker it must be a folder the container can see ([Quickstart](/docs/quickstart)).

## What it posts on its own

| Call | In Slack | In the dashboard |
|---|---|---|
| Hold, including Hold marked "urgent" | Posted to the channel | Yes |
| Watch | No | Yes |
| Note | No | Yes |

Each post has a button that opens the [dashboard](/docs/dashboard) on the matching page: Horizon, Lookout, Installed or Log.

## Settings

Set these in `.env`. Only the two keys are required.

| Setting | Default | Purpose |
|---|---|---|
| `SLACK_BOT_TOKEN` | none | The bot key. |
| `SLACK_APP_TOKEN` | none | The app key. |
| `CROWSNEST_ALERT_CHANNEL` | `#security` | Where serious calls are posted. |
| `CROWSNEST_API_URL` | `http://localhost:8000` | Where Crowsnest runs. |
| `CROWSNEST_DASHBOARD_URL` | `http://localhost:3000` | Where the buttons in each post point. |

If a key is missing, the bot stops and tells you to run `npm run setup`. If Crowsnest is not running yet, the bot keeps trying again with longer waits.

## If something goes wrong

| You see | Do this |
|---|---|
| "Crowsnest API is unreachable" in Slack | Start Crowsnest, or set `CROWSNEST_API_URL`. The message names the address it tried. |
| The bot stops at start | Run `npm run setup`, or `npm run doctor` to see which key is wrong. |
| A button opens the wrong page | Set `CROWSNEST_DASHBOARD_URL` to where your dashboard runs. |
| Nothing is posted | Only Hold calls are posted. Watch and Note stay in the dashboard. |

More fixes are on the [Troubleshooting](/docs/troubleshooting) page.

## Limits

- It does not post Watch or Note calls. Open the [dashboard](/docs/dashboard) for those.
- It does not check installs. Only [`crowsnest install`](/docs/cli) does that.
- It does not store your Slack keys safely. They sit in a plain text `.env` file, so keep it out of version control.
- It does not run itself. Start it again after a restart of your machine.

See also [Configuration](/docs/configuration) and the [VS Code extension](/docs/integrations/vscode).
