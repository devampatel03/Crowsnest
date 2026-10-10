import { getDocs, getPosts, getTerms } from '@/lib/content/loader';
import { ogImage } from '@/lib/og/render';

// Per-page cards at stable, unhashed URLs: /og/blog/<slug>, /og/docs/<slug>,
// /og/glossary/<slug>. BlogPosting JSON-LD names the exact image URL; Next's
// opengraph-image convention adds a content hash the page cannot know.
export const dynamic = 'force-static';
export const dynamicParams = false;

type Params = { section: string; slug: string[] };

export function generateStaticParams(): Params[] {
  return [
    ...getPosts().map((p) => ({ section: 'blog', slug: p.slug.split('/') })),
    ...getDocs().map((d) => ({ section: 'docs', slug: d.slug.split('/') })),
    ...getTerms().map((t) => ({ section: 'glossary', slug: t.slug.split('/') })),
  ];
}

export async function GET(_req: Request, { params }: { params: Promise<Params> }) {
  const { section, slug } = await params;
  const key = slug.join('/');
  if (section === 'blog') {
    const p = getPosts().find((x) => x.slug === key);
    if (p) return ogImage({ title: p.meta.h1 ?? p.meta.title, section: 'Blog' });
  } else if (section === 'docs') {
    const d = getDocs().find((x) => x.slug === key);
    if (d) return ogImage({ title: d.meta.h1 ?? d.meta.title, section: 'Docs' });
  } else if (section === 'glossary') {
    const t = getTerms().find((x) => x.slug === key);
    if (t) return ogImage({ title: t.meta.h1 ?? t.meta.term, section: 'Glossary' });
  }
  return new Response('Not found', { status: 404 });
}
