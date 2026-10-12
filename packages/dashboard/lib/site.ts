// Single source of truth for the site's canonical origin. Used by
// lib/seo/*, app/layout.tsx (metadataBase), app/sitemap.ts, app/robots.ts.
//
// Fail-loud rule (02-search-plan 2.4): a production build on CI, or on Vercel
// production, with no NEXT_PUBLIC_SITE_URL would bake http://localhost:3000
// into canonicals, the sitemap and robots.txt. That throws. Dev and test keep
// the localhost fallback.

const DEV_FALLBACK = 'http://localhost:3000';

const LOCAL_HOST = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i;

const VERCEL_HOST = /^https?:\/\/[^/]+\.vercel\.app(\/|$)/i;

/**
 * Vercel exposes its production domain as a bare hostname in VERCEL_PROJECT_PRODUCTION_URL (for example
 * `crowsnest.vercel.app`, or a custom domain once one is attached). It is used only when
 * NEXT_PUBLIC_SITE_URL is not set, so a Vercel deploy works without extra configuration and an explicit
 * value still wins. Previews use it too: their canonicals should point at production, not at a preview URL.
 */
function vercelProductionOrigin(env: Record<string, string | undefined>): string | undefined {
  const host = env.VERCEL_PROJECT_PRODUCTION_URL?.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  return host ? `https://${host}` : undefined;
}

export function resolveSiteUrl(env: Record<string, string | undefined>): string {
  const raw = env.NEXT_PUBLIC_SITE_URL?.trim() || vercelProductionOrigin(env);
  const isTest = env.NODE_ENV === 'test' || env.VITEST !== undefined;
  const mustBeSet =
    !isTest &&
    (env.CI === 'true' || (env.NODE_ENV === 'production' && env.VERCEL_ENV === 'production'));
  // CI and production builds must not ship a localhost origin either (local builds may).
  if (raw && mustBeSet && LOCAL_HOST.test(raw)) {
    throw new Error(
      `[crowsnest] NEXT_PUBLIC_SITE_URL is ${raw}, a localhost origin. A CI or production build would bake it into canonicals, the sitemap, robots.txt and JSON-LD. Set it to the production origin.`,
    );
  }
  // Only an explicit value is rejected: the zero-config fallback above may legitimately be a vercel.app host.
  const explicit = env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit && env.VERCEL_ENV === 'production' && !isTest && VERCEL_HOST.test(explicit)) {
    throw new Error(
      `[crowsnest] NEXT_PUBLIC_SITE_URL is ${explicit}, a vercel.app address. A production build would make search engines index that host instead of the custom domain. Set it to the custom domain.`,
    );
  }
  if (raw) return raw.replace(/\/+$/, '');
  if (mustBeSet) {
    throw new Error(
      '[crowsnest] NEXT_PUBLIC_SITE_URL is not set. Canonical URLs, the sitemap and robots.txt would point at ' +
        DEV_FALLBACK +
        '. Set it to the production origin, for example https://example.org.',
    );
  }
  return DEV_FALLBACK;
}

export const SITE_URL = resolveSiteUrl(process.env);

/** Normalise a site path: leading slash, no trailing slash (except root), no query, hash or .md suffix. */
export function normalizePath(path: string): string {
  let p = path.split('#')[0].split('?')[0];
  if (!p.startsWith('/')) p = `/${p}`;
  p = p.replace(/\.md$/, '').replace(/\/+$/, '');
  return p === '' ? '/' : p;
}

/**
 * Absolute canonical URL for a path. The root is `${SITE_URL}/` (origin form);
 * every other path has no trailing slash. The sitemap and `<link rel=canonical>`
 * must both use this function so they can never differ.
 */
export function canonicalUrl(path: string, base: string = SITE_URL): string {
  const p = normalizePath(path);
  return p === '/' ? `${base}/` : `${base}${p}`;
}
