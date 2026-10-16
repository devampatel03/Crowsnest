import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { consoleAllowed, isForwardedFromElsewhere } from '@/lib/console-access';

// The console (Horizon, Lookout, Hold, Log) opens only on the machine running Crowsnest. On the public website
// those paths answer 404, exactly as if they did not exist. Policy: lib/console-access.ts.
export function proxy(request: NextRequest) {
  // A reverse proxy usually rewrites Host to localhost, so a request forwarded from elsewhere is never local.
  const proxied = isForwardedFromElsewhere(
    request.headers.get('x-forwarded-for'),
    request.headers.get('x-forwarded-host'),
  );
  if (consoleAllowed(process.env, request.headers.get('host'), proxied)) return NextResponse.next();
  return NextResponse.rewrite(new URL('/not-found-console', request.url), { status: 404 });
}

export const config = {
  matcher: ['/horizon/:path*', '/lookout/:path*', '/hold/:path*', '/log/:path*'],
};
