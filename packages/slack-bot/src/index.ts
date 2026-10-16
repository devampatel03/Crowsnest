/**
 * Main entry point for the Crowsnest Slack bot.
 *
 * Architecture:
 *  1. Bolt App (Socket Mode) — handles slash commands
 *  2. CrowsnestApiClient     — talks to the FastAPI backend
 *  3. AlertStream            — subscribes to /api/events SSE stream
 *                              and posts CRITICAL/HIGH alerts to Slack
 */

import pkgBolt from '@slack/bolt';
const { App, LogLevel } = pkgBolt;
import { config, missingRequiredConfig } from './config.js';
import { explainSlackError } from './setup-lib.js';
import { CrowsnestApiClient } from './crowsnest-client.js';
import { registerCommands } from './commands.js';
import { AlertStream } from './alert-stream.js';
import { formatIncidentAlert } from './formatters.js';
import type { Incident, PublishEvent } from './types.js';

async function main(): Promise<void> {
  console.log('🦅 Crowsnest Slack Bot starting…');

  const missing = missingRequiredConfig();
  if (missing.length > 0) {
    console.error(
      `\nCannot start: ${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} not set.\n` +
        'Run `npm run setup` in packages/slack-bot. It walks you through creating the Slack app and saves the keys.\n'
    );
    process.exit(1);
  }

  // Socket Mode opens the WebSocket from this side, so no public HTTPS endpoint is needed. It requires
  // SLACK_APP_TOKEN (xapp-...).
  const app = new App({
    token:         config.slackBotToken,
    appToken:      config.slackAppToken,
    socketMode:    true,

    // Surface any Bolt errors to the console
    logger: {
      debug: (...msgs) => console.debug('[bolt]', ...msgs),
      info:  (...msgs) => console.info('[bolt]', ...msgs),
      warn:  (...msgs) => console.warn('[bolt]', ...msgs),
      error: (...msgs) => console.error('[bolt]', ...msgs),
      setLevel: () => { /* noop */ },
      setName:  () => { /* noop */ },
      getLevel: () => LogLevel.INFO,
    },
  });

  const apiClient = new CrowsnestApiClient(config.crowsnestApiUrl);

  registerCommands(app, apiClient);

  // Post every CRITICAL or HIGH incident from the SSE stream to the alert channel.
  const alertStream = new AlertStream(
    config.crowsnestApiUrl,

    // onAlert — called for every CRITICAL / HIGH incident
    async (incident: Incident): Promise<void> => {
      console.log(
        `[index] Posting ${incident.severity} alert for incident ${incident.id} ` +
          `to ${config.alertChannel}`
      );

      try {
        await app.client.chat.postMessage({
          channel: config.alertChannel,
          text: `${incident.severity} supply chain alert: ${incident.attack_pattern} detected in ${incident.packages.join(', ')}`,
          blocks: formatIncidentAlert(incident, config.dashboardUrl),
        });
      } catch (err) {
        console.error('[index] Failed to post alert to Slack:', err);
      }
    },

    // onPublishEvent — called for every SSE event (for logging / debugging)
    (event: PublishEvent): void => {
      if (event.type !== 'heartbeat') {
        console.log(
          `[index] SSE event: type=${event.type} ts=${event.timestamp}`
        );
      }
    }
  );

  // Start the SSE stream.  It will auto-reconnect if the API isn't up yet.
  alertStream.start();

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n[index] Received ${signal} — shutting down…`);
    alertStream.stop();
    await app.stop();
    console.log('[index] Goodbye! 👋');
    process.exit(0);
  };

  process.on('SIGINT',  () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.start();

  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║          🦅 Crowsnest Slack Bot Ready            ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  Mode:          Socket Mode (WebSocket)           ║`);
  console.log(`║  API:           ${config.crowsnestApiUrl.padEnd(33)}║`);
  console.log(`║  Alert channel: ${config.alertChannel.padEnd(33)}║`);
  console.log(`║  Dashboard:     ${config.dashboardUrl.padEnd(33)}║`);
  console.log('╠══════════════════════════════════════════════════╣');
  console.log('║  Commands registered:                             ║');
  console.log('║    /crowsnest-scan [path]                         ║');
  console.log('║    /crowsnest-investigate <package>               ║');
  console.log('║    /crowsnest-blast-radius <maintainer>           ║');
  console.log('║    /crowsnest-status                              ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');
}

main().catch((err) => {
  const code = (err as { data?: { error?: string } })?.data?.error;
  if (code) {
    console.error(`\nSlack refused to connect: ${explainSlackError(code)}\nRun \`npm run doctor\` for a full check.\n`);
  } else {
    console.error('[index] Fatal startup error:', err);
  }
  process.exit(1);
});
