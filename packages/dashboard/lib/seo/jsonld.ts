import { SITE_URL, canonicalUrl } from '@/lib/site';
import { breadcrumbTrail } from './breadcrumbs';
import { LICENSE_URL, LOGO_PATH, OPERATING_SYSTEMS, REPO_URL, SITE_NAME } from './constants';
import { ENTITY_DEFINITION } from './entity';
import type { ArticleInput, Crumb, FaqItem, HowToStepInput } from './types';

// Pure builders. They return plain objects so tests can import them without
// React. Policy: markup mirrors visible text; no ratings,
// no reviews, no SearchAction.

export type JsonLdObject = {
  '@context': 'https://schema.org';
  '@type': string;
  [key: string]: unknown;
};

const CONTEXT = 'https://schema.org' as const;

export const ids = {
  organization: () => `${SITE_URL}/#organization`,
  website: () => `${SITE_URL}/#website`,
  software: () => `${SITE_URL}/#software`,
  termSet: () => `${SITE_URL}/glossary#terms`,
  article: (path: string) => `${canonicalUrl(path)}#article`,
};

const abs = (path: string) => canonicalUrl(path);

export function organization(): JsonLdObject {
  return {
    '@context': CONTEXT,
    '@type': 'Organization',
    '@id': ids.organization(),
    name: SITE_NAME,
    url: abs('/'),
    logo: `${SITE_URL}${LOGO_PATH}`,
    sameAs: [REPO_URL],
  };
}

export function website(): JsonLdObject {
  return {
    '@context': CONTEXT,
    '@type': 'WebSite',
    '@id': ids.website(),
    name: SITE_NAME,
    url: abs('/'),
    inLanguage: 'en',
    publisher: { '@id': ids.organization() },
  };
}

export function softwareApplication(): JsonLdObject {
  return {
    '@context': CONTEXT,
    '@type': 'SoftwareApplication',
    '@id': ids.software(),
    name: SITE_NAME,
    applicationCategory: 'SecurityApplication',
    operatingSystem: OPERATING_SYSTEMS,
    description: ENTITY_DEFINITION,
    url: abs('/'),
    license: LICENSE_URL,
    codeRepository: REPO_URL,
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    publisher: { '@id': ids.organization() },
  };
}

export function faqPage(items: readonly FaqItem[]): JsonLdObject {
  if (items.length === 0) throw new Error('faqPage: no items');
  return {
    '@context': CONTEXT,
    '@type': 'FAQPage',
    mainEntity: items.map((q) => ({
      '@type': 'Question',
      name: q.question,
      acceptedAnswer: { '@type': 'Answer', text: q.answer },
    })),
  };
}

export function howTo(
  steps: readonly HowToStepInput[],
  meta: { name: string; description?: string; path?: string },
): JsonLdObject {
  if (steps.length === 0) throw new Error('howTo: no steps');
  const base = meta.path ? abs(meta.path) : undefined;
  return {
    '@context': CONTEXT,
    '@type': 'HowTo',
    name: meta.name,
    ...(meta.description ? { description: meta.description } : {}),
    step: steps.map((s, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: s.name,
      text: s.text,
      ...(base && s.anchor ? { url: `${base}#${s.anchor}` } : {}),
    })),
  };
}

function author(name?: string) {
  return name
    ? { '@type': 'Person', name }
    : { '@type': 'Organization', '@id': ids.organization(), name: SITE_NAME };
}

function articleBase(type: 'TechArticle' | 'BlogPosting', a: ArticleInput): JsonLdObject {
  return {
    '@context': CONTEXT,
    '@type': type,
    '@id': ids.article(a.path),
    headline: a.headline,
    description: a.description,
    datePublished: a.published ?? a.updated,
    dateModified: a.updated,
    author: author(a.author),
    publisher: { '@id': ids.organization() },
    mainEntityOfPage: abs(a.path),
    articleSection: a.section,
    inLanguage: 'en',
  };
}

export function techArticle(a: ArticleInput): JsonLdObject {
  return articleBase('TechArticle', a);
}

/** `image` is the absolute URL of the post's OG image route. */
export function blogPosting(a: ArticleInput & { image: string }): JsonLdObject {
  if (!a.author) throw new Error(`blogPosting ${a.path}: author is required`);
  if (!a.published) throw new Error(`blogPosting ${a.path}: published is required`);
  return { ...articleBase('BlogPosting', a), image: a.image };
}

export function definedTerm(t: { path: string; name: string; description: string }): JsonLdObject {
  return {
    '@context': CONTEXT,
    '@type': 'DefinedTerm',
    '@id': `${abs(t.path)}#term`,
    name: t.name,
    description: t.description,
    url: abs(t.path),
    inDefinedTermSet: {
      '@type': 'DefinedTermSet',
      '@id': ids.termSet(),
      name: 'Package security terms',
      url: abs('/glossary'),
    },
  };
}

export function breadcrumbList(trail: readonly Crumb[]): JsonLdObject {
  if (trail.length === 0) throw new Error('breadcrumbList: empty trail');
  return {
    '@context': CONTEXT,
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: abs(c.path),
    })),
  };
}

/** BreadcrumbList from a path and leaf name; identical to the visible trail from `breadcrumbTrail`. */
export function breadcrumbsFor(path: string, leafName: string): JsonLdObject {
  return breadcrumbList(breadcrumbTrail(path, leafName));
}

type Item = { name: string; path: string };

function itemListEntries(items: readonly Item[]) {
  return items.map((it, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    url: abs(it.path),
    name: it.name,
  }));
}

export function itemList(items: readonly Item[]): JsonLdObject {
  return { '@context': CONTEXT, '@type': 'ItemList', itemListElement: itemListEntries(items) };
}

export type WebPageKind = 'WebPage' | 'AboutPage' | 'CollectionPage';
type PageMeta = { path: string; name: string; description: string; updated?: string };

export function webPage(
  kind: WebPageKind,
  meta: PageMeta,
  opts: { items?: readonly Item[]; aboutSoftware?: boolean } = {},
): JsonLdObject {
  return {
    '@context': CONTEXT,
    '@type': kind,
    '@id': `${abs(meta.path)}#webpage`,
    name: meta.name,
    description: meta.description,
    url: abs(meta.path),
    inLanguage: 'en',
    isPartOf: { '@id': ids.website() },
    ...(meta.updated ? { dateModified: meta.updated } : {}),
    ...(opts.aboutSoftware ? { about: { '@id': ids.software() } } : {}),
    ...(opts.items
      ? { mainEntity: { '@type': 'ItemList', itemListElement: itemListEntries(opts.items) } }
      : {}),
  };
}

/** Index pages: CollectionPage whose mainEntity is an ItemList. */
export function collectionPage(meta: PageMeta, items: readonly Item[]): JsonLdObject {
  return webPage('CollectionPage', meta, { items });
}

/**
 * Strings that must appear in the visible page text (mirror rule, 3.3.1).
 * Used by the page-level tests; lives next to the builders so the
 * rule and the markup change together.
 */
export function mirroredStrings(block: Record<string, unknown>): string[] {
  const out: string[] = [];
  const add = (v: unknown) => {
    if (typeof v === 'string' && v.trim()) out.push(v);
  };
  switch (block['@type']) {
    case 'TechArticle':
    case 'BlogPosting':
      add(block.headline);
      add(block.description);
      break;
    case 'DefinedTerm':
      add(block.name);
      add(block.description);
      break;
    case 'FAQPage':
      for (const q of (block.mainEntity as { name: string; acceptedAnswer: { text: string } }[]) ?? []) {
        add(q.name);
        add(q.acceptedAnswer?.text);
      }
      break;
    case 'HowTo':
      for (const s of (block.step as { name: string; text: string }[]) ?? []) {
        add(s.name);
        add(s.text);
      }
      break;
    case 'BreadcrumbList':
      for (const li of (block.itemListElement as { name: string }[]) ?? []) add(li.name);
      break;
    case 'SoftwareApplication':
      add(block.description);
      break;
  }
  return out;
}
