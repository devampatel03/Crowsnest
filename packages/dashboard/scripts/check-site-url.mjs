// Build guard: in CI or a Vercel production build NEXT_PUBLIC_SITE_URL must be
// set and must not be a localhost origin. Local builds may use localhost.
//   node scripts/check-site-url.mjs
const env = process.env;
const prod = env.CI === 'true' || (env.NODE_ENV === 'production' && env.VERCEL_ENV === 'production');
const url = (env.NEXT_PUBLIC_SITE_URL ?? '').trim();
const local = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i;
if (prod && (!url || local.test(url))) {
  console.error('[crowsnest] NEXT_PUBLIC_SITE_URL must be the production origin for CI builds (got ' + (url || 'nothing') + ').');
  process.exit(1);
}
// A *.vercel.app origin on the production deploy makes every canonical, the
// sitemap and robots.txt name that host, so search engines index it instead of
// the real domain.
if (env.VERCEL_ENV === 'production' && /^https?:\/\/[^/]+\.vercel\.app(\/|$)/i.test(url)) {
  console.error('[crowsnest] NEXT_PUBLIC_SITE_URL is ' + url + ', a vercel.app address. Set it to the custom domain (https://crowsnest.co.in) in the Vercel project settings.');
  process.exit(1);
}
console.log('[crowsnest] site url check ok' + (url ? ': ' + url : ' (local default)'));
