import type { MetadataRoute } from 'next';
import { allPublicRoutes } from '@/lib/content/routes';
import { buildSitemap } from '@/lib/seo/sitemap';

// lastModified comes from frontmatter dates, never from the build clock.
export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemap(allPublicRoutes());
}
