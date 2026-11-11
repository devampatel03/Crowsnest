import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { appMode } from '@/lib/app-mode';
import { consoleAllowed, isForwardedFromElsewhere } from '@/lib/console-access';
import { routeFor } from '@/lib/console-route';

// Two apps share this build (lib/app-mode.ts). The dashboard answers on its own port with Horizon at `/`;
// the public website never serves the console, and the console never serves website pages.
// Policy: lib/console-access.ts and lib/console-route.ts.
export function proxy(request: NextRequest) {
  // A reverse proxy usually rewrites Host to localhost, so a request forwarded from elsewhere is never local.
  const proxied = isForwardedFromElsewhere(
    request.headers.get('x-forwarded-for'),
    request.headers.get('x-forwarded-host'),
  );
  const allowed = consoleAllowed(process.env, request.headers.get('host'), proxied);
  const action = routeFor(appMode(process.env), request.nextUrl.pathname, allowed);

  switch (action.kind) {
    case 'rewrite':
      return NextResponse.rewrite(new URL(action.to + request.nextUrl.search, request.url));
    case 'redirect':
      return NextResponse.redirect(new URL(action.to + request.nextUrl.search, request.url), 308);
    case 'notfound':
      return NextResponse.rewrite(new URL('/not-found-console', request.url), { status: 404 });
    default:
      return NextResponse.next();
  }
}

// Everything except Next.js internals, API routes and files with an extension (fonts, images, robots.txt).
export const config = {
  matcher: ['/((?!_next/|api/|.*\\..*).*)'],
};
