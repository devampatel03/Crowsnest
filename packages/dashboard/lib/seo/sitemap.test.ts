import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildSitemap, maxUpdated, type SitemapRoute } from './sitemap';

const routes: SitemapRoute[] = [
  { path: '/', kind: 'landing', updated: '2026-10-01' },
  { path: '/docs', kind: 'docIndex', updated: '2026-09-20' },
  { path: '/docs/quickstart', kind: 'docs', updated: '2026-09-01' },
  { path: '/docs/cli', kind: 'docs', updated: '2026-09-02' },
  { path: '/blog/what-is-slopsquatting', kind: 'post', updated: '2026-09-15' },
  { path: '/about', kind: 'utility', updated: '2026-08-01' },
];

afterEach(() => vi.useRealTimers());

describe('buildSitemap', () => {
  const sm = buildSitemap(routes, 'https://e.org');

  it('uses canonical urls and frontmatter dates', () => {
    expect(sm.map((e) => e.url)).toEqual([
      'https://e.org/',
      'https://e.org/docs',
      'https://e.org/docs/quickstart',
      'https://e.org/docs/cli',
      'https://e.org/blog/what-is-slopsquatting',
      'https://e.org/about',
    ]);
    expect((sm[2].lastModified as Date).toISOString().slice(0, 10)).toBe('2026-09-01');
  });

  it('priorities follow the plan and changeFrequency is omitted', () => {
    expect(sm.map((e) => e.priority)).toEqual([1.0, 0.9, 0.8, 0.8, 0.7, 0.4]);
    for (const e of sm) expect(e.changeFrequency).toBeUndefined();
  });

  it('lastModified is stable across time (no new Date())', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-06T00:00:00Z'));
    const a = JSON.stringify(buildSitemap(routes, 'https://e.org'));
    vi.setSystemTime(new Date('2026-10-06T00:00:05Z'));
    expect(JSON.stringify(buildSitemap(routes, 'https://e.org'))).toBe(a);
  });

  it('rejects console, api and raw routes, bad dates and duplicates', () => {
    for (const p of ['/horizon', '/lookout/x', '/hold', '/log', '/api/events', '/raw/docs/a'])
      expect(() => buildSitemap([{ path: p, kind: 'docs', updated: '2026-01-01' }])).toThrow(/not a public route/);
    expect(() => buildSitemap([{ path: '/docs/a', kind: 'docs', updated: 'yesterday' }])).toThrow(/invalid/);
    expect(() => buildSitemap([routes[1], routes[1]])).toThrow(/duplicate/);
  });

  it('contains no console url', () => {
    for (const e of sm) expect(e.url).not.toMatch(/\/(horizon|lookout|hold|log|api)(\/|$)/);
  });

  it('maxUpdated picks the latest ISO date', () => {
    expect(maxUpdated(['2026-01-02', '2026-03-01', '2025-12-31'])).toBe('2026-03-01');
    expect(() => maxUpdated([])).toThrow();
  });
});
