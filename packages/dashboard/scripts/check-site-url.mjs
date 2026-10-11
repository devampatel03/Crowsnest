// Build guard: in CI or a Vercel production build NEXT_PUBLIC_SITE_URL must be
// set and must not be a localhost origin. Local builds may use localhost.
//   node scripts/check-site-url.mjs
const env = process.env;
const prod = env.CI === 'true' || (env.NODE_ENV === 'production' && env.VERCEL_ENV === 'production');
// On Vercel the production domain is provided as a bare hostname; use it when the variable is not set.
const vercelHost = (env.VERCEL_PROJECT_PRODUCTION_URL ?? '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
const url = (env.NEXT_PUBLIC_SITE_URL ?? '').trim() || (vercelHost ? 'https://' + vercelHost : '');
const local = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i;
if (prod && (!url || local.test(url))) {
  console.error('[crowsnest] NEXT_PUBLIC_SITE_URL must be the production origin for CI builds (got ' + (url || 'nothing') + ').');
  process.exit(1);
}
console.log('[crowsnest] site url check ok' + (url ? ': ' + url : ' (local default)'));
