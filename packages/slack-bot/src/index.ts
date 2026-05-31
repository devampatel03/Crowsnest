/**
 * src/index.ts
 *
 * Main entry point for the Crowsnest Slack bot.
 *
 * Architecture:
 *  1. Bolt App (Socket Mode) — handles slash commands
 *  2. CrowsnestApiClient     — talks to the FastAPI backend
 *  3. AlertStream            — subscribes to /api/events SSE stream
 *                              and posts CRITICAL/HIGH alerts to Slack
 */

import pkgBolt from '@slack/bolt';
const { App } = pkgBolt;
import { config, warnMissingConfig } from './config.js';
import { CrowsnestApiClient } from './crowsnest-client.js';
import { registerCommands } from './commands.js';
import { AlertStream } from './alert-stream.js';
import { formatIncidentAlert } from './formatters.js';
import type { Incident, PublishEvent } from './types.js';

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('🦅 Crowsnest Slack Bot starting…');

  // Warn about missing env vars — but don't crash so dev experience is smooth
  warnMissingConfig();

  // -------------------------------------------------------------------------
  // 1. Create Bolt app in Socket Mode
  //    Socket Mode uses a WebSocket connection initiated from our side, so
  //    no public HTTPS endpoint is needed.  Requires SLACK_APP_TOKEN (xapp-…).
  // -------------------------------------------------------------------------
  const app = new App({
    token:         config.slackBotToken,
    appToken:      config.slackAppToken,
    signingSecret: config.slackSigningSecret,
    socketMode:    true,

    // Surface any Bolt errors to the console
    logger: {
      debug: (...msgs) => console.debug('[bolt]', ...msgs),
      info:  (...msgs) => console.info('[bolt]', ...msgs),
      warn:  (...msgs) => console.warn('[bolt]', ...msgs),
      error: (...msgs) => console.error('[bolt]', ...msgs),
      setLevel: () => { /* noop */ },
      setName:  () => { /* noop */ },
      getLevel: () => 'info' as const,
    },
  });

  // -------------------------------------------------------------------------
  // 2. Create the Crowsnest API client
  // -------------------------------------------------------------------------
  const apiClient = new CrowsnestApiClient(config.crowsnestApiUrl);

  // -------------------------------------------------------------------------
  // 3. Register slash commands
  // -------------------------------------------------------------------------
  registerCommands(app, apiClient);

  // -------------------------------------------------------------------------
  // 4. Set up the SSE alert stream
  //    When a CRITICAL or HIGH incident is detected, post to the alert channel.
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // 5. Graceful shutdown
  // -------------------------------------------------------------------------
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n[index] Received ${signal} — shutting down…`);
    alertStream.stop();
    await app.stop();
    console.log('[index] Goodbye! 👋');
    process.exit(0);
  };

  process.on('SIGINT',  () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  // -------------------------------------------------------------------------
  // 6. Start Bolt
  // -------------------------------------------------------------------------
  await app.start();

  // Print startup summary
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
  console.error('[index] Fatal startup error:', err);
  process.exit(1);
});
