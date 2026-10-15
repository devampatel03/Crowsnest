import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  buildManifestUrl,
  explainSlackError,
  isAppToken,
  isBotToken,
  missingScopes,
  normalizeChannel,
  slackApi,
  upsertEnv,
} from '../src/setup-lib.js';

describe('manifest', () => {
  const manifest = JSON.parse(readFileSync(new URL('../slack-app-manifest.json', import.meta.url), 'utf8'));

  it('declares the four commands the bot answers, socket mode, and the scopes it needs', () => {
    expect(manifest.features.slash_commands.map((c: { command: string }) => c.command).sort()).toEqual([
      '/crowsnest-blast-radius',
      '/crowsnest-investigate',
      '/crowsnest-scan',
      '/crowsnest-status',
    ]);
    expect(manifest.settings.socket_mode_enabled).toBe(true);
    expect(manifest.oauth_config.scopes.bot).toEqual(expect.arrayContaining(['commands', 'chat:write', 'chat:write.public']));
  });

  it('round-trips through the one-click URL', () => {
    const url = new URL(buildManifestUrl(manifest));
    expect(url.origin + url.pathname).toBe('https://api.slack.com/apps');
    expect(JSON.parse(url.searchParams.get('manifest_json')!)).toEqual(manifest);
  });
});

describe('key shapes', () => {
  // Built at runtime so no string in the source looks like a real Slack token to secret scanners.
  const fakeBotKey = ['xoxb', '1'.repeat(12), '2'.repeat(12), 'a'.repeat(24)].join('-');
  const fakeAppKey = ['xapp', '1', 'A'.repeat(11), '3'.repeat(13), 'b'.repeat(32)].join('-');

  it('accepts keys of the right shape and rejects the wrong kind', () => {
    expect(isBotToken(fakeBotKey)).toBe(true);
    expect(isAppToken(fakeAppKey)).toBe(true);
    expect(isBotToken(fakeAppKey)).toBe(false);
    expect(isAppToken(fakeBotKey)).toBe(false);
    expect(isBotToken('xoxb-your-bot-token-here')).toBe(false);
    expect(isBotToken('')).toBe(false);
  });
});

describe('normalizeChannel', () => {
  it.each([
    ['', '#security'],
    ['  ', '#security'],
    ['security', '#security'],
    ['#ops', '#ops'],
    ['C0123ABCDEF', 'C0123ABCDEF'],
    ['@oncall', '#oncall'],
  ])('%j -> %s', (input, expected) => expect(normalizeChannel(input)).toBe(expected));
});

describe('upsertEnv', () => {
  it('replaces existing keys in place and keeps everything else', () => {
    const before = '# comment\nA=1\nSLACK_BOT_TOKEN=old\nB=2\n';
    const after = upsertEnv(before, { SLACK_BOT_TOKEN: 'new' });
    expect(after).toBe('# comment\nA=1\nSLACK_BOT_TOKEN=new\nB=2\n');
  });

  it('appends missing keys and handles an empty file', () => {
    expect(upsertEnv('', { X: '1' })).toBe('X=1\n');
    expect(upsertEnv('A=1', { X: '1', Y: '2' })).toBe('A=1\n\nX=1\nY=2\n');
  });

  it('keeps Windows line endings and does not touch lookalike keys', () => {
    const out = upsertEnv('SLACK_BOT_TOKEN_OLD=keep\r\nSLACK_BOT_TOKEN=a\r\n', { SLACK_BOT_TOKEN: 'b' });
    expect(out).toBe('SLACK_BOT_TOKEN_OLD=keep\r\nSLACK_BOT_TOKEN=b\r\n');
  });

  it('is idempotent', () => {
    const once = upsertEnv('A=1\n', { X: '1' });
    expect(upsertEnv(once, { X: '1' })).toBe(once);
  });
});

describe('explainSlackError', () => {
  it('gives a plain next step for the common failures, and a pointer for unknown ones', () => {
    expect(explainSlackError('invalid_auth')).toMatch(/copy it again/i);
    expect(explainSlackError('not_in_channel')).toMatch(/\/invite/);
    expect(explainSlackError('missing_scope')).toMatch(/manifest/);
    expect(explainSlackError('weird_new_code')).toContain('weird_new_code');
  });
});

describe('slackApi', () => {
  it('reads ok, error and scopes from a Slack reply', async () => {
    const fake = (async () =>
      new Response(JSON.stringify({ ok: true, team: 'T' }), { headers: { 'x-oauth-scopes': 'commands, chat:write' } })) as typeof fetch;
    const r = await slackApi('xoxb-x', 'auth.test', {}, fake);
    expect(r).toMatchObject({ ok: true, scopes: ['commands', 'chat:write'] });
    expect(missingScopes(r.scopes, ['commands', 'chat:write', 'groups:read'])).toEqual(['groups:read']);
  });

  it('turns a Slack error and a network failure into codes instead of throwing', async () => {
    const slackErr = (async () => new Response(JSON.stringify({ ok: false, error: 'invalid_auth' }))) as typeof fetch;
    expect((await slackApi('t', 'auth.test', {}, slackErr)).error).toBe('invalid_auth');
    const down = (async () => {
      throw new Error('offline');
    }) as typeof fetch;
    expect((await slackApi('t', 'auth.test', {}, down)).error).toBe('network_error');
  });
});
