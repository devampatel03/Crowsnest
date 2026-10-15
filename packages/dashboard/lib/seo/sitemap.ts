import type { MetadataRoute } from 'next';
import { canonicalUrl } from '@/lib/site';
import type { PageKind } from './types';

// Pure sitemap builder. app/sitemap.ts maps the
// site's content index to `SitemapRoute[]` and returns buildSitemap().
// lastModified always comes from frontmatter dates, never from new Date().

export interface SitemapRoute {
  path: string;
  kind: PageKind;
  /** ISO YYYY-MM-DD from frontmatter `updated` (or the pages registry). */
  updated: string;
}

const PRIORITY: Record<PageKind, number> = {
  landing: 1.0,
  docs: 0.8,
  docIndex: 0.9,
  post: 0.7,
  blogIndex: 0.8,
  term: 0.7,
  glossaryIndex: 0.6,
  utility: 0.4,
};

export function priorityFor(route: SitemapRoute): number {
  return PRIORITY[route.kind];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function buildSitemap(routes: readonly SitemapRoute[], base?: string): MetadataRoute.Sitemap {
  const seen = new Set<string>();
  return routes.map((r) => {
    if (!ISO_DATE.test(r.updated) || Number.isNaN(Date.parse(r.updated))) {
      throw new Error(`sitemap: ${r.path} has invalid updated date "${r.updated}"`);
    }
    if (/^\/(horizon|lookout|hold|log|api|raw)(\/|$)/.test(r.path)) {
      throw new Error(`sitemap: ${r.path} is not a public route`);
    }
    const url = canonicalUrl(r.path, base);
    if (seen.has(url)) throw new Error(`sitemap: duplicate url ${url}`);
    seen.add(url);
    return { url, lastModified: new Date(`${r.updated}T00:00:00.000Z`), priority: priorityFor(r) };
  });
}

/** Latest `updated` among children, for index pages and the landing page. */
export function maxUpdated(dates: readonly string[]): string {
  if (dates.length === 0) throw new Error('maxUpdated: no dates');
  return [...dates].sort().at(-1)!;
}
