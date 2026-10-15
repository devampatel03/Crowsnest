import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';
import { AI_CRAWLERS, PRIVATE_DISALLOW, PUBLIC_ALLOW } from './constants';

/**
 * Pure robots definition. app/robots.ts is a one-line
 * wrapper: `export default function robots() { return buildRobots(); }`.
 * One rule object per crawler so each gets its own explicit User-Agent block.
 * All six AI crawlers are allowed on public content.
 */
export function buildRobots(base: string = SITE_URL): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: [...PRIVATE_DISALLOW] },
      ...AI_CRAWLERS.map((userAgent) => ({
        userAgent,
        allow: [...PUBLIC_ALLOW],
        disallow: [...PRIVATE_DISALLOW],
      })),
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
