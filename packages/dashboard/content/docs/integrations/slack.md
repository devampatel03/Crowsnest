---
title: Slack bot
description: "Set up the Crowsnest Slack bot with one guided command. It posts serious calls to a channel and answers four slash commands, with no public web address needed."
slug: integrations/slack
order: 6
section: Integrations
updated: 2026-10-13
howTo: true
question: How do I set up the Crowsnest Slack bot?
answer: Run npm run setup in packages/slack-bot. It opens Slack with the app pre-filled, checks the two keys you paste, sends a test message and saves everything to .env. Then run npm run dev. The bot posts only the most serious calls to #security by default. No public web address is needed.
facts:
  - "Four slash commands: /crowsnest-scan, /crowsnest-investigate, /crowsnest-blast-radius, /crowsnest-status (slack-bot source, 2026-10-07)."
  - "Posts only the most serious calls, which the product shows as Hold (slack-bot source, 2026-10-07)."
  - "Default channel: #security, set with CROWSNEST_ALERT_CHANNEL (slack-bot source, 2026-10-07)."
  - "Two Slack keys are needed: SLACK_BOT_TOKEN and SLACK_APP_TOKEN. The signing secret is not used in Socket Mode (slack-bot source, 2026-10-13)."
  - "Default Crowsnest address: http://localhost:8000; default dashboard address: http://localhost:3000 (slack-bot source, 2026-10-07)."
related:
  - /docs/configuration
  - /docs/dashboard
  - /docs/troubleshooting
  - /docs/cli
---

The Slack bot posts every Hold to a channel of your choice and answers four commands. It connects out to Slack, so you do not need a public web address. Set it up once; it needs three Slack keys.

## What do I need?

A Slack workspace where you may add apps, and Crowsnest running on port 8000. The bot is built from source; it is not in a package store. You do not need a public web address or a signing secret.

## How do I set it up?

Run the guided setup. It takes about three minutes.

```bash
cd packages/slack-bot
npm install
npm run setup
```

It opens Slack's "create app from manifest" page with every permission and slash command already filled in, so you only pick a workspace and click Create. Then it asks for two keys and checks each one with Slack as you paste it:

1. **Bot key** (`xoxb-...`) from the app's OAuth & Permissions page, after you click Install to Workspace.
2. **App key** (`xapp-...`) from Basic Information, App-Level Tokens, with the `connections:write` permission.

It then asks which channel to use, posts a test message there, and saves the keys to the `.env` file in the Crowsnest folder. Start the bot with `npm run dev`.

Run `npm run doctor` any time to check the keys, permissions and the backend without changing anything. If Slack refuses to connect, the bot prints what went wrong in plain words and points to this command.

Prefer to do it by hand? Create the app from `packages/slack-bot/slack-app-manifest.json` (Slack, Your Apps, Create New App, From a manifest), install it, and put the two keys in `.env`:

```env
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
CROWSNEST_ALERT_CHANNEL=#security
```

The manifest includes the `chat:write.public` permission, so the bot can post in any public channel without being invited. For a private channel, invite it with `/invite @Crowsnest`.

If a key is missing, the bot stops and tells you to run `npm run setup`. If Crowsnest is not running yet, the bot keeps trying again with longer waits.

## Which commands does it answer?

| Command | What it does |
|---|---|
| `/crowsnest-scan /path/to/project` | Scans a project and posts the result. With no path it scans `/tmp/project`, which is rarely what you want, so always give one. |
| `/crowsnest-investigate left-pad` | Checks one package. |
| `/crowsnest-blast-radius some-login` | Lists what is affected if one publisher is compromised. A leading `@` is fine. |
| `/crowsnest-status` | Shows how many packages Crowsnest has checked and how many serious calls are open. |

The path in `/crowsnest-scan` is read by the Crowsnest service, so with Docker it must be a folder the container can see (see the [Quickstart](/docs/quickstart)).

## What does it post on its own?

Only the most serious calls: Hold and Hold with "urgent". Watch and Note stay in the dashboard. Each post has a button that opens the dashboard at `http://localhost:3000` by default. Change it with `CROWSNEST_DASHBOARD_URL`.

## What if the bot cannot reach Crowsnest?

Slack shows "Crowsnest API is unreachable" with the address it tried, `http://localhost:8000` by default. Start Crowsnest, or set `CROWSNEST_API_URL` in `.env`.

## What this does not do

- It does not post Watch or Note calls. Open the [dashboard](/docs/dashboard) for those.
- It does not check installs. Only [`crowsnest install`](/docs/cli) does that.
- It does not store your Slack keys safely. They sit in a plain text `.env` file, so keep it out of version control.
- It does not run itself. Start it again after a restart of your machine.

Related pages: [Configuration](/docs/configuration), [Troubleshooting](/docs/troubleshooting) and the [VS Code extension](/docs/integrations/vscode).

**Keep the channel small. A channel that only gets Holds gets read.**
