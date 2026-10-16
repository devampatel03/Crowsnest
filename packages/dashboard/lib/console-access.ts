// Who may open the console (Horizon, Lookout, Hold, Log).
//
// The console shows one installation's data, so it belongs on the machine that runs Crowsnest. The public
// website is docs and a landing page only. Rule, in order:
//   1. CROWSNEST_CONSOLE=on  -> always open  (self-hosting behind your own login or VPN)
//   2. CROWSNEST_CONSOLE=off -> always closed
//   3. running on Vercel     -> closed
//   4. otherwise             -> open only for a loopback host (localhost, 127.0.0.1, ::1) that no reverse
//                               proxy forwarded (a proxy often rewrites Host to localhost)

export const CONSOLE_PATHS = ['/horizon', '/lookout', '/hold', '/log'] as const;

type Env = Record<string, string | undefined>;

const LOOPBACK = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|::1)$/i;

/** Strip the port from a Host header value: `localhost:3000` -> `localhost`, `[::1]:3000` -> `[::1]`. */
export function hostnameOf(host: string | null | undefined): string {
  const h = (host ?? '').trim().toLowerCase();
  if (h.startsWith('[')) return h.slice(0, h.indexOf(']') + 1);
  return h.split(':')[0];
}

export function isConsolePath(pathname: string): boolean {
  return CONSOLE_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Does the build/runtime environment allow the console at all? Used for links, which cannot see the request host. */
export function consoleAllowedByEnv(env: Env): boolean {
  const flag = env.CROWSNEST_CONSOLE?.trim().toLowerCase();
  if (flag === 'on') return true;
  if (flag === 'off') return false;
  return !env.VERCEL;
}

/**
 * Did a reverse proxy forward this request from somewhere else? Next.js stamps x-forwarded-for/-host on every
 * request itself (with ::1 and the local host), so the headers' presence means nothing; a value that is not
 * loopback does.
 */
export function isForwardedFromElsewhere(forwardedFor: string | null, forwardedHost: string | null): boolean {
  const ips = (forwardedFor ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const stripV6Map = (ip: string) => ip.replace(/^::ffff:/i, '');
  const ipRemote = ips.some((ip) => !LOOPBACK.test(stripV6Map(ip)) && ip !== '::1');
  const hostRemote = !!forwardedHost && !LOOPBACK.test(hostnameOf(forwardedHost.split(',')[0]));
  return ipRemote || hostRemote;
}

/** Full decision for one request. */
export function consoleAllowed(env: Env, host: string | null | undefined, proxied = false): boolean {
  const flag = env.CROWSNEST_CONSOLE?.trim().toLowerCase();
  if (flag === 'on') return true;
  if (!consoleAllowedByEnv(env)) return false;
  return !proxied && LOOPBACK.test(hostnameOf(host));
}
