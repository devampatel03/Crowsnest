/**
 * src/setup.ts: `npm run setup` (guided) and `npm run doctor` (check only).
 *
 * Setup opens Slack's "create app from manifest" page with every permission and command pre-filled, asks for the
 * two keys, checks each against Slack, finds the alert channel, posts a test message, and saves the result to .env.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  RECOMMENDED_SCOPES,
  REQUIRED_SCOPES,
  buildManifestUrl,
  explainSlackError,
  isAppToken,
  isBotToken,
  missingScopes,
  normalizeChannel,
  slackApi,
  upsertEnv,
} from './setup-lib.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgDir = path.resolve(here, '..');
const repoRoot = path.resolve(pkgDir, '..', '..');
const envPath = path.join(repoRoot, '.env');
const manifestPath = path.join(pkgDir, 'slack-app-manifest.json');

const ok = (m: string) => console.log(`  ✓ ${m}`);
const bad = (m: string) => console.log(`  ✗ ${m}`);
const note = (m: string) => console.log(`  · ${m}`);

function readEnv(): Record<string, string> {
  if (!fs.existsSync(envPath)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

function openBrowser(url: string): void {
  const [cmd, args] =
    process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url.replace(/&/g, '^&')]]
    : process.platform === 'darwin' ? ['open', [url]]
    : ['xdg-open', [url]];
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
  } catch {
    // The URL is printed too.
  }
}

/** Checks a bot key; returns the workspace and bot names, or prints why not. */
async function checkBotToken(token: string): Promise<{ team: string; scopes: string[] } | null> {
  if (!isBotToken(token)) {
    bad('That does not look like a bot key. It starts with xoxb-.');
    return null;
  }
  const r = await slackApi(token, 'auth.test');
  if (!r.ok) {
    bad(r.error === 'network_error' ? 'Could not reach Slack. Check your internet connection.' : explainSlackError(r.error ?? 'unknown'));
    return null;
  }
  const missing = missingScopes(r.scopes, REQUIRED_SCOPES);
  if (missing.length) {
    bad(`The app is missing the ${missing.join(', ')} permission. Reinstall it from the manifest (see docs).`);
    return null;
  }
  ok(`Bot key works. Workspace: ${String(r.data.team)}, bot: ${String(r.data.user)}`);
  const soft = missingScopes(r.scopes, RECOMMENDED_SCOPES);
  if (soft.length) note(`Optional permissions missing: ${soft.join(', ')}. You will need to invite the bot to channels by hand.`);
  return { team: String(r.data.team), scopes: r.scopes };
}

async function checkAppToken(token: string): Promise<boolean> {
  if (!isAppToken(token)) {
    bad('That does not look like an app key. It starts with xapp-.');
    return false;
  }
  const r = await slackApi(token, 'apps.connections.open');
  if (!r.ok) {
    bad(explainSlackError(r.error === 'not_authed' ? 'invalid_app_token' : r.error ?? 'unknown'));
    return false;
  }
  ok('App key works (Socket Mode can connect).');
  return true;
}

async function postTestMessage(token: string, channel: string): Promise<boolean> {
  const r = await slackApi(token, 'chat.postMessage', {
    channel,
    text: ':white_check_mark: Crowsnest is connected. Serious package risks will be posted here.',
  });
  if (!r.ok) {
    bad(`Could not post to ${channel}: ${explainSlackError(r.error ?? 'unknown')}`);
    return false;
  }
  ok(`Posted a test message to ${channel}.`);
  return true;
}

async function checkBackend(url: string): Promise<void> {
  try {
    const res = await fetch(`${url}/api/stats`, { signal: AbortSignal.timeout(4000) });
    if (res.ok) ok(`Crowsnest backend answers at ${url}.`);
    else bad(`Crowsnest backend at ${url} answered with an error (${res.status}).`);
  } catch {
    note(`Crowsnest backend is not running at ${url}. Start it before starting the bot; the bot keeps retrying.`);
  }
}

async function doctor(): Promise<number> {
  console.log('\nCrowsnest Slack check\n');
  const env = { ...readEnv(), ...Object.fromEntries(Object.entries(process.env).filter(([, v]) => v)) } as Record<string, string>;
  let failures = 0;
  const bot = env.SLACK_BOT_TOKEN;
  const app = env.SLACK_APP_TOKEN;
  if (!bot || !app) {
    bad(`Missing ${[!bot && 'SLACK_BOT_TOKEN', !app && 'SLACK_APP_TOKEN'].filter(Boolean).join(' and ')}. Run: npm run setup`);
    return 1;
  }
  if (!(await checkBotToken(bot))) failures++;
  if (!(await checkAppToken(app))) failures++;
  const channel = normalizeChannel(env.CROWSNEST_ALERT_CHANNEL ?? '');
  note(`Alerts go to ${channel}. Run npm run setup to send a test message.`);
  await checkBackend(env.CROWSNEST_API_URL || 'http://localhost:8000');
  console.log(failures ? '\nSomething needs fixing (above).\n' : '\nAll good. Start the bot with: npm run dev\n');
  return failures ? 1 : 0;
}

async function setup(): Promise<number> {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as object;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (q: string) => (await rl.question(q)).trim();
  const existing = readEnv();

  console.log('\nCrowsnest Slack setup (about 3 minutes)\n');
  console.log('Step 1. Create the app. Your browser opens Slack with every permission and command filled in.');
  console.log('        Pick your workspace, click Create, then Install to Workspace.\n');
  const url = buildManifestUrl(manifest);
  console.log(`        If the browser does not open, use this link:\n        ${url}\n`);
  openBrowser(url);
  await ask('Press Enter when the app is installed… ');

  console.log('\nStep 2. Copy the Bot User OAuth Token (OAuth & Permissions page, starts with xoxb-).');
  let botToken = '';
  while (!(await checkBotToken((botToken = await ask('  Bot key: '))))) { /* ask again */ }

  console.log('\nStep 3. Create the app key: Basic Information, App-Level Tokens, Generate Token, add the');
  console.log('        connections:write permission. It starts with xapp-.');
  let appToken = '';
  while (!(await checkAppToken((appToken = await ask('  App key: '))))) { /* ask again */ }

  console.log('\nStep 4. Which channel should serious alerts go to?');
  const channel = normalizeChannel(await ask(`  Channel [${existing.CROWSNEST_ALERT_CHANNEL || '#security'}]: `) || existing.CROWSNEST_ALERT_CHANNEL || '');
  let posted = await postTestMessage(botToken, channel);
  if (!posted) {
    console.log(`        Invite the bot first: in Slack type /invite @Crowsnest in ${channel}, then press Enter.`);
    await ask('');
    posted = await postTestMessage(botToken, channel);
  }
  rl.close();

  const before = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  fs.writeFileSync(
    envPath,
    upsertEnv(before, {
      SLACK_BOT_TOKEN: botToken,
      SLACK_APP_TOKEN: appToken,
      CROWSNEST_ALERT_CHANNEL: channel,
    })
  );
  ok(`Saved to ${envPath}. Keep that file out of version control (it is already ignored).`);
  await checkBackend(existing.CROWSNEST_API_URL || 'http://localhost:8000');
  console.log(`\nDone. Start the bot with: npm run dev${posted ? '' : '\n(The test message did not post. Fix the channel above, then run npm run doctor.)'}\n`);
  return posted ? 0 : 1;
}

const mode = process.argv[2];
(mode === 'doctor' ? doctor() : setup()).then(
  (code) => process.exit(code),
  (err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
);
