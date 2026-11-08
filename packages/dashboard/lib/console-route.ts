// What each app does with a request path. proxy.ts applies the answer; this file only decides.
//
//   console app  `/` is Horizon (served from the /horizon route, URL unchanged), `/horizon` itself redirects to
//                `/`, Lookout, Installed and Log keep their paths, and every website page is a 404. Docs live on
//                the website, not on the dashboard port.
//   site app     everything is the website; the four console paths answer 404.

import type { AppMode } from './app-mode';
import { isConsolePath } from './console-access';

export type RouteAction =
  | { kind: 'next' }
  | { kind: 'rewrite'; to: string }
  | { kind: 'redirect'; to: string }
  | { kind: 'notfound' };

/** Generated assets the dashboard needs on its own port. */
const ASSET_ROUTES = ['/icon', '/apple-icon'];

export function routeFor(mode: AppMode, pathname: string, allowed: boolean): RouteAction {
  if (mode === 'site') {
    if (isConsolePath(pathname) && !allowed) return { kind: 'notfound' };
    return { kind: 'next' };
  }

  if (ASSET_ROUTES.includes(pathname)) return { kind: 'next' };
  if (pathname === '/') return allowed ? { kind: 'rewrite', to: '/horizon' } : { kind: 'notfound' };
  if (pathname === '/horizon') return allowed ? { kind: 'redirect', to: '/' } : { kind: 'notfound' };
  if (isConsolePath(pathname)) return allowed ? { kind: 'next' } : { kind: 'notfound' };
  return { kind: 'notfound' };
}
