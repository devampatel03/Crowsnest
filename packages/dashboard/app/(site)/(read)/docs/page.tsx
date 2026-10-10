import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DocView } from '@/components/site/DocView';
import { HUBS } from '@/lib/content/hubs';
import { getIntroduction } from '@/lib/content/loader';
import { buildMetadata } from '@/lib/seo/metadata';
import { canonicalUrl } from '@/lib/site';

// /docs is the Introduction page (content/docs/introduction.md).
export function generateMetadata(): Metadata {
  const intro = getIntroduction();
  return buildMetadata({
    path: '/docs',
    title: intro?.meta.metaTitle ?? intro?.meta.title ?? HUBS.docs.metaTitle,
    description: intro?.meta.description ?? HUBS.docs.description,
    type: 'article',
    modifiedTime: intro?.meta.updated,
    section: intro?.meta.section,
    ogImage: canonicalUrl('/og/docs/introduction'),
    markdown: true,
  });
}

export default async function DocsHome() {
  const intro = getIntroduction();
  if (!intro) notFound();
  return DocView({ doc: intro });
}
