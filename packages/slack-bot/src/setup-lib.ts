/**
 * The pure, testable parts of onboarding: the one-click app URL, token shape checks, safe .env editing, and
 * plain-language explanations of Slack's error codes. Used by `npm run setup` and `npm run doctor`.
 */

export const DEFAULT_CHANNEL = '#security';

/** Scopes the bot cannot work without, and the one that removes the "invite the bot first" step. */
export const REQUIRED_SCOPES = ['commands', 'chat:write'] as const;
export const RECOMMENDED_SCOPES = ['chat:write.public', 'channels:read', 'groups:read'] as const;

/** Slack opens "Create app from manifest" with everything filled in when given this URL. */
export function buildManifestUrl(manifest: object): string {
  return `https://api.slack.com/apps?new_app=1&manifest_json=${encodeURIComponent(JSON.stringify(manifest))}`;
}

export const isBotToken = (s: string): boolean => /^xoxb-[A-Za-z0-9-]{20,}$/.test(s.trim());
export const isAppToken = (s: string): boolean => /^xapp-[A-Za-z0-9-]{20,}$/.test(s.trim());

/** `security` -> `#security`; `#ops` and channel IDs (`C012AB3CD`) are kept; blank -> the default. */
export function normalizeChannel(input: string): string {
  const v = input.trim();
  if (!v) return DEFAULT_CHANNEL;
  if (v.startsWith('#') || /^[CGD][A-Z0-9]{8,}$/.test(v)) return v;
  return `#${v.replace(/^@/, '')}`;
}

/**
 * Sets KEY=value lines in .env text. Existing keys are replaced in place, new keys are appended, and every other
 * line (comments, other settings) is left exactly as it was.
 */
export function upsertEnv(text: string, updates: Record<string, string>): string {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text === '' ? [] : text.split(/\r?\n/);
  const pending = new Map(Object.entries(updates));

  const out = lines.map((line) => {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (m && pending.has(m[1])) {
      const value = pending.get(m[1])!;
      pending.delete(m[1]);
      return `${m[1]}=${value}`;
    }
    return line;
  });

  if (pending.size > 0) {
    if (out.length > 0 && out[out.length - 1] !== '') out.push('');
    for (const [k, v] of pending) out.push(`${k}=${v}`);
    out.push('');
  } else if (out.length > 0 && out[out.length - 1] !== '') {
    out.push('');
  }
  return out.join(eol);
}

/** What a Slack error code means for the person setting this up, and what to do about it. */
export function explainSlackError(code: string): string {
  switch (code) {
    case 'invalid_auth':
    case 'not_authed':
      return 'Slack does not accept that key. Copy it again from the app page, with no spaces, and check it belongs to this app.';
    case 'token_revoked':
    case 'token_expired':
      return 'That key was revoked or has expired. Generate a new one on the app page.';
    case 'account_inactive':
      return 'The Slack account that installed the app was deactivated. Reinstall the app from an active account.';
    case 'missing_scope':
      return 'The app is missing a permission. Add the scopes from slack-app-manifest.json on the app page (OAuth & Permissions), then reinstall the app.';
    case 'channel_not_found':
      return 'Slack cannot see that channel. Check the name, or for a private channel invite the bot with /invite @Crowsnest.';
    case 'not_in_channel':
      return 'The bot is not in that channel. Invite it with /invite @Crowsnest, or add the chat:write.public scope so it can post to public channels without joining.';
    case 'is_archived':
      return 'That channel is archived. Pick another one.';
    case 'restricted_action':
    case 'action_prohibited':
      return 'Your workspace settings stop the bot from posting there. Ask a workspace admin, or choose another channel.';
    case 'ratelimited':
      return 'Slack asked us to slow down. Wait a minute and try again.';
    case 'invalid_app_token':
      return 'That is not an app-level key. It should start with xapp- and have the connections:write permission.';
    default:
      return `Slack said "${code}". Search that word at https://api.slack.com/methods to see what it means.`;
  }
}

export interface SlackReply {
  ok: boolean;
  error?: string;
  /** Scopes the key has, from the x-oauth-scopes header. */
  scopes: string[];
  data: Record<string, unknown>;
}

/** One Slack Web API call. Never throws on a Slack-side error; network failures become `network_error`. */
export async function slackApi(
  token: string,
  method: string,
  params: Record<string, unknown> = {},
  fetchImpl: typeof fetch = fetch
): Promise<SlackReply> {
  try {
    const res = await fetchImpl(`https://slack.com/api/${method}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json()) as Record<string, unknown>;
    const scopes = (res.headers.get('x-oauth-scopes') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    return { ok: data.ok === true, error: typeof data.error === 'string' ? data.error : undefined, scopes, data };
  } catch (err) {
    return { ok: false, error: 'network_error', scopes: [], data: { message: err instanceof Error ? err.message : String(err) } };
  }
}

/** Which of `wanted` the key lacks. */
export const missingScopes = (have: string[], wanted: readonly string[]): string[] => wanted.filter((s) => !have.includes(s));
