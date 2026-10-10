import { describe, expect, it } from 'vitest';
import { buildRobots } from './robots';
import { AI_CRAWLERS, PRIVATE_DISALLOW } from './constants';
import { SITE_URL } from '@/lib/site';

const r = buildRobots();
const rules = (Array.isArray(r.rules) ? r.rules : [r.rules]) as {
  userAgent?: string | string[];
  allow?: string | string[];
  disallow?: string | string[];
}[];

describe('robots', () => {
  it('names six AI crawlers explicitly, one block each', () => {
    expect(AI_CRAWLERS).toHaveLength(6);
    for (const ua of AI_CRAWLERS) {
      expect(rules.filter((x) => [x.userAgent].flat().includes(ua))).toHaveLength(1);
      expect(rules.find((x) => x.userAgent === ua)).toBeTruthy();
    }
  });

  it('starts with the wildcard rule', () => {
    expect(rules[0].userAgent).toBe('*');
  });

  it('every rule disallows api, raw and the four console routes', () => {
    for (const x of rules)
      for (const p of ['/api', '/raw', '/horizon', '/lookout', '/hold', '/log'])
        expect([x.disallow].flat()).toContain(p);
    expect(PRIVATE_DISALLOW).toContain('/raw');
  });

  it('no rule disallows public content', () => {
    for (const x of rules)
      for (const p of ['/', '/docs', '/blog', '/glossary', '/about', '/privacy', '/llms.txt', '/llms-full.txt', '/rss.xml'])
        expect([x.disallow ?? []].flat()).not.toContain(p);
  });

  it('AI blocks explicitly allow the machine-readable files', () => {
    for (const ua of AI_CRAWLERS) {
      const x = rules.find((y) => y.userAgent === ua)!;
      expect([x.allow].flat()).toEqual(expect.arrayContaining(['/docs', '/llms.txt', '/llms-full.txt']));
    }
  });

  it('points at the sitemap', () => {
    expect(r.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
    expect(buildRobots('https://e.org').sitemap).toBe('https://e.org/sitemap.xml');
  });
});
