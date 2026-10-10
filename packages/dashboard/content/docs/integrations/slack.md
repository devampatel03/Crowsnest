---
title: Slack bot
description: "Set up the Crowsnest Slack bot to post serious calls to a channel and run four slash commands. Keys, steps and fixes, with no public web address needed."
slug: integrations/slack
order: 6
section: Integrations
updated: 2026-10-07
howTo: true
question: How do I set up the Crowsnest Slack bot?
answer: Turn on Socket Mode in your Slack app, add the four slash commands, put the three Slack keys in .env, and run npm run dev in packages/slack-bot. The bot posts only the most serious calls to #security by default. No public web address is needed.
facts:
  - "Four slash commands: /crowsnest-scan, /crowsnest-investigate, /crowsnest-blast-radius, /crowsnest-status (slack-bot source, 2026-10-07)."
  - "Posts only the most serious calls, which the product shows as Hold (slack-bot source, 2026-10-07)."
  - "Default channel: #security, set with CROWSNEST_ALERT_CHANNEL (slack-bot source, 2026-10-07)."
  - "Three Slack keys are needed: SLACK_BOT_TOKEN, SLACK_APP_TOKEN and SLACK_SIGNING_SECRET (.env.example, 2026-10-07)."
  - "Default Crowsnest address: http://localhost:8000; default dashboard address: http://localhost:3000 (slack-bot source, 2026-10-07)."
related:
  - /docs/configuration
  - /docs/dashboard
  - /docs/troubleshooting
  - /docs/cli
---

The Slack bot posts every Hold to a channel of your choice and answers four commands. It connects out to Slack, so you do not need a public web address. Set it up once; it needs three Slack keys.

## What do I need?

A Slack app with a bot key, an app key for socket connections, and a signing secret. Crowsnest running on port 8000. The bot is built from source; it is not in a package store.

## How do I set it up?

1. **Turn on Socket Mode.** In your Slack app settings, turn on Socket Mode and create an app-level key with the `connections:write` permission. The menu names are Slack's; see Slack's own documentation if they have moved.
2. **Add the four slash commands** from the table below to the app, and install the app to your workspace.
3. **Add your keys** to the `.env` file in the Crowsnest folder. The bot reads that file.
   ```env
   SLACK_BOT_TOKEN=xoxb-...
   SLACK_APP_TOKEN=xapp-...
   SLACK_SIGNING_SECRET=...
   CROWSNEST_ALERT_CHANNEL=#security
   ```
4. **Start the bot.**
   ```bash
   cd packages/slack-bot
   npm install
   npm run dev
   ```
5. **Invite the bot to the channel**, for example with `/invite @your-bot`, so it is allowed to post there.

If a key is missing, the bot prints a warning and keeps running, but Slack will not connect. If Crowsnest is not running yet, the bot keeps trying again with longer waits.

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
