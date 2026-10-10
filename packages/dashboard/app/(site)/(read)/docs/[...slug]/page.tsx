import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DocView } from '@/components/site/DocView';
import { getDoc, getDocs, INTRO_SLUG } from '@/lib/content/loader';
import { buildMetadata } from '@/lib/seo/metadata';
import { canonicalUrl } from '@/lib/site';

type Props = { params: Promise<{ slug: string[] }> };

// Only content that exists is routable; anything else is a 404. The
// Introduction is served at /docs, not here.
export const dynamicParams = false;

export function generateStaticParams() {
  return getDocs()
    .filter((d) => d.slug !== INTRO_SLUG)
    .map((d) => ({ slug: d.slug.split('/') }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const doc = getDoc(slug.join('/'));
  if (!doc || doc.slug === INTRO_SLUG) return {};
  return buildMetadata({
    path: doc.path,
    title: doc.meta.metaTitle ?? doc.meta.title,
    description: doc.meta.description,
    type: 'article',
    modifiedTime: doc.meta.updated,
    section: doc.meta.section,
    ogImage: canonicalUrl(`/og/docs/${doc.slug}`),
    markdown: true,
  });
}

export default async function DocPage({ params }: Props) {
  const { slug } = await params;
  const doc = getDoc(slug.join('/'));
  if (!doc || doc.slug === INTRO_SLUG) notFound();
  return DocView({ doc });
}
