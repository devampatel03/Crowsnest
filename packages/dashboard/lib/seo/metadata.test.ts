import { describe, expect, it } from 'vitest';
import { buildMetadata, checkMetadataInput, CONSOLE_ROBOTS, formatTitle, rootMetadata, truncateTopic } from './metadata';
import { canonicalUrl, normalizePath, resolveSiteUrl, SITE_URL } from '@/lib/site';
import { ROOT_TITLE } from './constants';

const DESC = 'x'.repeat(150);

describe('title contract', () => {
  it('appends the brand with an em dash and stays <= 60', () => {
    expect(formatTitle('Get started with Crowsnest')).toBe('Get started with Crowsnest — Crowsnest');
    expect(formatTitle('Scan a project for supply chain attacks').length).toBeLessThanOrEqual(60);
  });

  it('truncates the topic, never the brand, on a word boundary', () => {
    const long = 'How do I scan a project for supply chain attacks with the command line';
    const t = formatTitle(long);
    expect(t.length).toBeLessThanOrEqual(60);
    expect(t.endsWith(' — Crowsnest')).toBe(true);
    expect(truncateTopic(long)).not.toMatch(/\s$/);
    expect(long.startsWith(truncateTopic(long))).toBe(true);
  });

  it('landing uses the root title', () => {
    expect(formatTitle(null)).toBe(ROOT_TITLE);
    expect(ROOT_TITLE.length).toBeLessThanOrEqual(60);
  });

  it('checkMetadataInput fails (does not truncate) on long topics', () => {
    const p = checkMetadataInput({ path: '/docs/x', title: 'y'.repeat(49), description: DESC });
    expect(p.some((x) => x.field === 'title')).toBe(true);
    expect(checkMetadataInput({ path: '/docs/x', title: 'y'.repeat(48), description: DESC })).toEqual([]);
  });

  it('checkMetadataInput enforces description 140-160 and path shape', () => {
    const bad = (description: string, path = '/docs/x') => checkMetadataInput({ path, title: 'T', description });
    expect(bad('x'.repeat(139)).some((x) => x.field === 'description')).toBe(true);
    expect(bad('x'.repeat(161)).some((x) => x.field === 'description')).toBe(true);
    expect(bad('x'.repeat(140))).toEqual([]);
    expect(bad('x'.repeat(160))).toEqual([]);
    expect(bad(DESC, '/docs/x.md').some((x) => x.field === 'path')).toBe(true);
    expect(bad(DESC, 'docs/x').some((x) => x.field === 'path')).toBe(true);
  });
});

describe('buildMetadata', () => {
  it('emits absolute title, canonical, robots and twitter card', () => {
    const m = buildMetadata({ path: '/docs/coral-engine', title: 'CoralEngine: SQL federation on DuckDB', description: DESC, type: 'article', publishedTime: '2026-09-01', modifiedTime: '2026-10-01', section: 'Architecture' });
    expect(m.title).toEqual({ absolute: 'CoralEngine: SQL federation on DuckDB — Crowsnest' });
    expect(m.alternates?.canonical).toBe(`${SITE_URL}/docs/coral-engine`);
    const robots = m.robots as Record<string, any>;
    expect(robots.index).toBe(true);
    expect(robots.googleBot['max-snippet']).toBe(-1);
    expect(robots.googleBot['max-image-preview']).toBe('large');
    expect(m.twitter).toMatchObject({ card: 'summary_large_image', description: DESC });
    expect(m.openGraph).toMatchObject({ type: 'article', url: `${SITE_URL}/docs/coral-engine`, siteName: 'Crowsnest', locale: 'en_US', publishedTime: '2026-09-01', modifiedTime: '2026-10-01', section: 'Architecture' });
    expect(m.other).toEqual({ 'article:section': 'Architecture' });
  });

  it('website type omits article fields; explicit image is mirrored to twitter', () => {
    const m = buildMetadata({ path: '/docs', title: 'Documentation', description: DESC, type: 'website', ogImage: '/docs/opengraph-image' });
    expect(m.openGraph).toMatchObject({ type: 'website' });
    expect(JSON.stringify(m.openGraph)).not.toContain('publishedTime');
    expect((m.openGraph as any).images[0]).toMatchObject({ width: 1200, height: 630 });
    expect((m.twitter as any).images).toEqual(['/docs/opengraph-image']);
  });

  it('falls back to the sitewide card for og:image and twitter:image', () => {
    const m = buildMetadata({ path: '/about', title: 'About Crowsnest', description: DESC });
    expect((m.openGraph as any).images[0].url).toMatch(/opengraph-image$/);
    expect((m.twitter as any).images).toHaveLength(1);
    expect((m.twitter as any).images[0]).toMatch(/opengraph-image$/);
  });

  it('never sets keywords, nosnippet or a title template', () => {
    const m = buildMetadata({ path: '/about', title: 'About Crowsnest', description: DESC });
    expect(m.keywords).toBeUndefined();
    expect(JSON.stringify(m)).not.toMatch(/nosnippet|"template"/);
  });

  it('root metadata has no template and links the RSS feed', () => {
    const m = rootMetadata('d');
    expect(m.title).toBe(ROOT_TITLE);
    expect(m.alternates?.types).toEqual({ 'application/rss+xml': '/rss.xml' });
    expect(String(m.metadataBase)).toMatch(/^https?:\/\//);
  });

  it('console robots are noindex,nofollow', () => {
    expect(CONSOLE_ROBOTS).toMatchObject({ index: false, follow: false });
  });
});

describe('canonical urls', () => {
  it('normalises paths and uses one form for root', () => {
    expect(normalizePath('/docs/x/')).toBe('/docs/x');
    expect(normalizePath('/docs/x.md')).toBe('/docs/x');
    expect(normalizePath('/docs/x?a=1#h')).toBe('/docs/x');
    expect(normalizePath('')).toBe('/');
    expect(canonicalUrl('/', 'https://e.org')).toBe('https://e.org/');
    expect(canonicalUrl('/docs/', 'https://e.org')).toBe('https://e.org/docs');
  });

  it('SITE_URL has no trailing slash', () => {
    expect(SITE_URL.endsWith('/')).toBe(false);
  });
});

describe('resolveSiteUrl', () => {
  it('uses the env var and strips trailing slashes', () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: 'https://e.org//' })).toBe('https://e.org');
  });
  it('falls back to localhost in dev and test', () => {
    expect(resolveSiteUrl({ NODE_ENV: 'development' })).toBe('http://localhost:3000');
    expect(resolveSiteUrl({ NODE_ENV: 'test', CI: 'true' })).toBe('http://localhost:3000');
  });
  it('throws on CI or Vercel production when unset', () => {
    expect(() => resolveSiteUrl({ NODE_ENV: 'production', CI: 'true' })).toThrow(/NEXT_PUBLIC_SITE_URL/);
    expect(() => resolveSiteUrl({ NODE_ENV: 'production', VERCEL_ENV: 'production' })).toThrow();
  });
  it('does not throw on a local production build', () => {
    expect(resolveSiteUrl({ NODE_ENV: 'production' })).toBe('http://localhost:3000');
  });
});
