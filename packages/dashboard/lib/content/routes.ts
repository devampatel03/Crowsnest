import type { PageKind } from '@/lib/seo/types';
import { maxUpdated, type SitemapRoute } from '@/lib/seo/sitemap';
import { getAllEntries, getDocs, getPosts, getTerms } from './loader';

// Public route registry: the single list the sitemap, llms.txt, RSS and the
// page-level tests read. Entries come from the loaded content; hubs take the
// newest `updated` among their children. Static pages (about, privacy) carry
// their own date here.

export interface StaticPageDate {
  path: string;
  updated: string;
}

/** Dated static pages. `updated` is the date the page text last changed. */
export const STATIC_PAGE_DATES: StaticPageDate[] = [
  { path: '/about', updated: '2026-10-07' },
  { path: '/privacy', updated: '2026-10-07' },
];

/** The 26 public content routes (brief section 11). Tests check every loaded entry is in this list. */
export const PLANNED_PATHS: readonly string[] = [
  '/',
  '/docs',
  ...[
    'quickstart',
    'installation',
    'cli',
    'dashboard',
    'integrations/slack',
    'integrations/vscode',
    'configuration',
    'faq',
    'troubleshooting',
    'contributing',
  ].map((s) => `/docs/${s}`),
  '/blog',
  ...[
    'what-is-slopsquatting',
    'how-to-stay-safe-from-malicious-packages',
    'what-to-do-when-crowsnest-says-hold',
    'crowsnest-0-1-0-release-notes',
  ].map((s) => `/blog/${s}`),
  '/glossary',
  ...[
    'slopsquatting',
    'typosquatting',
    'dependency-confusion',
    'maintainer-takeover',
    'lockfile',
    'supply-chain-attack',
  ].map((s) => `/glossary/${s}`),
  '/about',
  '/privacy',
];

const dates = (xs: { meta: { updated: string } }[]) => xs.map((x) => x.meta.updated);
const staticDates = () => STATIC_PAGE_DATES.map((s) => s.updated);

/** Newest `updated` across everything that has one; falls back to the static pages. */
export function siteLastUpdated(): string {
  return maxUpdated([...dates(getAllEntries()), ...staticDates()]);
}

export function allPublicRoutes(): SitemapRoute[] {
  const docs = getDocs();
  const posts = getPosts();
  const terms = getTerms();
  const routes: SitemapRoute[] = [];
  const push = (path: string, kind: PageKind, updated: string) => routes.push({ path, kind, updated });

  push('/', 'landing', siteLastUpdated());
  for (const d of docs) push(d.path, d.path === '/docs' ? 'docIndex' : 'docs', d.meta.updated);
  if (!docs.some((d) => d.path === '/docs')) push('/docs', 'docIndex', maxUpdated(dates(docs).concat(staticDates())));
  push('/blog', 'blogIndex', posts.length ? maxUpdated(dates(posts)) : STATIC_PAGE_DATES[0].updated);
  for (const p of posts) push(p.path, 'post', p.meta.updated);
  push('/glossary', 'glossaryIndex', terms.length ? maxUpdated(dates(terms)) : STATIC_PAGE_DATES[0].updated);
  for (const t of terms) push(t.path, 'term', t.meta.updated);
  for (const s of STATIC_PAGE_DATES) push(s.path, 'utility', s.updated);
  return routes;
}
