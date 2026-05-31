/**
 * src/commands.ts
 *
 * Registers all Crowsnest slash commands with the Slack Bolt app.
 *
 * Slack requires a response (ack) within 3 seconds.  Every command immediately
 * acks, then does the slow API work asynchronously and posts the result back.
 *
 * Commands:
 *   /crowsnest-scan [project_path]
 *   /crowsnest-investigate <package>
 *   /crowsnest-blast-radius <maintainer>
 *   /crowsnest-status
 */

import type { App } from '@slack/bolt';
import type { WebClient } from '@slack/web-api';
import { CrowsnestApiClient, CrowsnestApiError } from './crowsnest-client.js';
import {
  formatScanResult,
  formatInvestigation,
  formatBlastRadius,
  formatStats,
} from './formatters.js';
import { config } from './config.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Posts an error message back to the channel / response_url when an API call
 * fails.  Distinguishes between "API is down" and other errors.
 */
async function postError(
  client: WebClient,
  channelId: string,
  context: string,
  err: unknown
): Promise<void> {
  const isDown =
    err instanceof CrowsnestApiError && err.isNetworkError;

  const text = isDown
    ? `⚠️ *Crowsnest API is unreachable* — make sure the backend is running at \`${config.crowsnestApiUrl}\`.\n_Command: ${context}_`
    : `❌ *Error running ${context}:* ${err instanceof Error ? err.message : String(err)}`;

  await client.chat.postMessage({
    channel: channelId,
    text,
    blocks: [{ type: 'section', text: { type: 'mrkdwn', text } }],
  });
}

/**
 * Posts a Block Kit message to the channel where the command was issued.
 */
async function postBlocks(
  client: WebClient,
  channelId: string,
  fallbackText: string,
  blocks: Record<string, unknown>[]
): Promise<void> {
  await client.chat.postMessage({
    channel: channelId,
    text: fallbackText,  // Shown in notifications and accessibility
    blocks,
  });
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerCommands(app: App, apiClient: CrowsnestApiClient): void {

  // -------------------------------------------------------------------------
  // /crowsnest-scan [project_path]
  // -------------------------------------------------------------------------
  app.command('/crowsnest-scan', async ({ command, ack, client }) => {
    // Ack immediately — Slack requires this within 3 seconds
    await ack('🔍 Scan started — results will appear here shortly…');

    const rawText = command.text.trim();
    const projectPath = rawText || '/tmp/project';
    const usingDefault = !rawText;

    const channelId = command.channel_id;

    // Optionally notify that a default path is being used
    if (usingDefault) {
      await client.chat.postMessage({
        channel: channelId,
        text: `ℹ️ No project path provided — scanning default path \`${projectPath}\`.`,
      });
    }

    try {
      const result = await apiClient.scan(projectPath);
      await postBlocks(
        client,
        channelId,
        `Scan complete for ${projectPath}: ${result.incidents.length} incident(s) found.`,
        formatScanResult(result, projectPath, config.dashboardUrl)
      );
    } catch (err) {
      await postError(client, channelId, `/crowsnest-scan ${projectPath}`, err);
    }
  });

  // -------------------------------------------------------------------------
  // /crowsnest-investigate <package>
  // -------------------------------------------------------------------------
  app.command('/crowsnest-investigate', async ({ command, ack, client }) => {
    const pkg = command.text.trim();

    if (!pkg) {
      await ack('❌ Please provide a package name, e.g. `/crowsnest-investigate left-pad`');
      return;
    }

    await ack(`🔬 Investigating \`${pkg}\`…`);

    const channelId = command.channel_id;

    try {
      const result = await apiClient.investigate(pkg);
      await postBlocks(
        client,
        channelId,
        `Investigation complete for ${pkg}: ${result.verdict}.`,
        formatInvestigation(pkg, result, config.dashboardUrl)
      );
    } catch (err) {
      await postError(client, channelId, `/crowsnest-investigate ${pkg}`, err);
    }
  });

  // -------------------------------------------------------------------------
  // /crowsnest-blast-radius <maintainer>
  // -------------------------------------------------------------------------
  app.command('/crowsnest-blast-radius', async ({ command, ack, client }) => {
    // Strip leading '@' if the user included it
    const maintainer = command.text.trim().replace(/^@/, '');

    if (!maintainer) {
      await ack(
        '❌ Please provide a maintainer login, e.g. `/crowsnest-blast-radius sindresorhus`'
      );
      return;
    }

    await ack(`💣 Calculating blast radius for @${maintainer}…`);

    const channelId = command.channel_id;

    try {
      const result = await apiClient.blastRadius(maintainer);
      await postBlocks(
        client,
        channelId,
        `Blast radius for @${maintainer}: ${result.total_affected} affected packages/projects.`,
        formatBlastRadius(maintainer, result, config.dashboardUrl)
      );
    } catch (err) {
      await postError(client, channelId, `/crowsnest-blast-radius @${maintainer}`, err);
    }
  });

  // -------------------------------------------------------------------------
  // /crowsnest-status
  // -------------------------------------------------------------------------
  app.command('/crowsnest-status', async ({ command, ack, client }) => {
    await ack('📊 Fetching Crowsnest status…');

    const channelId = command.channel_id;

    try {
      const stats = await apiClient.getStats();
      await postBlocks(
        client,
        channelId,
        `Crowsnest status: ${stats.total_packages} packages, ` +
          `${stats.active_incidents.CRITICAL} critical / ` +
          `${stats.active_incidents.HIGH} high incidents.`,
        formatStats(stats, config.dashboardUrl)
      );
    } catch (err) {
      await postError(client, channelId, `/crowsnest-status`, err);
    }
  });
}
