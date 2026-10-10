import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { parseJsonLd } from '@/test/jsonld-extract';
import { getDocs, getPosts, getTerms } from '@/lib/content/loader';
import { EXPECTED_TYPES } from '@/lib/seo/expected-types';
import { mirroredStrings } from '@/lib/seo/jsonld';
import type { PageKind } from '@/lib/seo/types';
import AboutPage from './(plain)/about/page';
import PrivacyPage from './(quiet)/privacy/page';
import BlogIndex from './(read)/blog/page';
import BlogPost from './(read)/blog/[slug]/page';
import DocPage from './(read)/docs/[...slug]/page';
import DocsHome from './(read)/docs/page';
import GlossaryIndex from './(read)/glossary/page';
import TermPage from './(read)/glossary/[term]/page';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  notFound: () => {
    throw new Error('notFound');
  },
}));

const decode = (s: string) =>
  s
    .replace(/<\/?(code|a|strong|em|span|time|b|i)(?=[\s>])[^>]*>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

function check(el: ReactElement, kind: PageKind, expectedTypes: readonly string[] = EXPECTED_TYPES[kind]) {
  const html = renderToStaticMarkup(el);
  expect((html.match(/<h1[\s>]/g) ?? []).length, 'one h1').toBe(1);
  const blocks = parseJsonLd(html);
  const types = blocks.map((b) => b['@type']);
  for (const t of expectedTypes) expect(types, `types ${kind}`).toContain(t);
  const text = decode(html);
  for (const b of blocks) {
    for (const s of mirroredStrings(b)) expect(text, `mirror: ${s.slice(0, 60)}`).toContain(s.replace(/\s+/g, ' '));
  }
  return { html, blocks };
}

describe('page-level JSON-LD, headings and mirror rule', () => {
  it('hubs and utility pages', async () => {
    check(await DocsHome(), 'docIndex');
    check(<BlogIndex />, 'blogIndex');
    check(<GlossaryIndex />, 'glossaryIndex');
    check(<AboutPage />, 'utility', ['AboutPage', 'BreadcrumbList']);
    check(<PrivacyPage />, 'utility');
  });

  it('every doc page except the Introduction', async () => {
    for (const d of getDocs().filter((x) => x.slug !== 'introduction')) {
      const el = await DocPage({ params: Promise.resolve({ slug: d.slug.split('/') }) });
      const { blocks } = check(el, 'docs');
      if (d.meta.howTo) expect(blocks.map((b) => b['@type']), d.path).toContain('HowTo');
      if (d.slug === 'faq') expect(blocks.map((b) => b['@type'])).toContain('FAQPage');
    }
  });

  it('every post and term', async () => {
    for (const p of getPosts()) check(await BlogPost({ params: Promise.resolve({ slug: p.slug }) }), 'post');
    for (const t of getTerms()) check(await TermPage({ params: Promise.resolve({ term: t.slug }) }), 'term');
  });

  it('unknown slugs 404, and the Introduction is not routable at /docs/introduction', async () => {
    await expect(DocPage({ params: Promise.resolve({ slug: ['nope'] }) })).rejects.toThrow('notFound');
    await expect(DocPage({ params: Promise.resolve({ slug: ['introduction'] }) })).rejects.toThrow('notFound');
  });

  it('the 0.1.0 release notes carry a visible unreleased note', async () => {
    const post = getPosts().find((p) => p.meta.status);
    if (!post) return;
    const html = renderToStaticMarkup(await BlogPost({ params: Promise.resolve({ slug: post.slug }) }));
    expect(html).toContain('Unreleased');
  });
});

describe('social metadata on every sitemap URL', () => {
  it('carries og:image and twitter:image on every public route', async () => {
    const { allPublicRoutes } = await import('@/lib/content/routes');
    const metas = new Map<string, Metadata>();
    const mods = {
      '/': await import('./(plain)/page'),
      '/blog': await import('./(read)/blog/page'),
      '/glossary': await import('./(read)/glossary/page'),
      '/about': await import('./(plain)/about/page'),
      '/privacy': await import('./(quiet)/privacy/page'),
    } as Record<string, { metadata: Metadata }>;
    for (const [p, m] of Object.entries(mods)) metas.set(p, m.metadata);
    metas.set('/docs', (await import('./(read)/docs/page')).generateMetadata());
    for (const d of getDocs().filter((x) => x.slug !== 'introduction')) {
      const mod = await import('./(read)/docs/[...slug]/page');
      metas.set(d.path, await mod.generateMetadata({ params: Promise.resolve({ slug: d.slug.split('/') }) }));
    }
    for (const p of getPosts()) {
      const mod = await import('./(read)/blog/[slug]/page');
      metas.set(p.path, await mod.generateMetadata({ params: Promise.resolve({ slug: p.slug }) }));
    }
    for (const t of getTerms()) {
      const mod = await import('./(read)/glossary/[term]/page');
      metas.set(t.path, await mod.generateMetadata({ params: Promise.resolve({ term: t.slug }) }));
    }
    for (const r of allPublicRoutes()) {
      const m = metas.get(r.path);
      expect(m, `metadata for ${r.path}`).toBeDefined();
      const og = (m!.openGraph as { images?: { url: string }[] }).images;
      const tw = (m!.twitter as { images?: string[] }).images;
      expect(og?.[0]?.url, `og:image ${r.path}`).toMatch(/^https?:\/\//);
      expect(tw?.[0], `twitter:image ${r.path}`).toMatch(/^https?:\/\//);
    }
  });
});
