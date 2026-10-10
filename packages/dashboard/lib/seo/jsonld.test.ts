import { describe, expect, it } from 'vitest';
import {
  blogPosting,
  breadcrumbList,
  breadcrumbsFor,
  collectionPage,
  definedTerm,
  faqPage,
  howTo,
  mirroredStrings,
  organization,
  softwareApplication,
  techArticle,
  webPage,
  website,
} from './jsonld';
import { breadcrumbTrail } from './breadcrumbs';
import { ENTITY_DEFINITION } from './entity';
import { REPO_URL } from './constants';
import { serializeJsonLd } from './serialize';

const RATINGS = /aggregateRating|"review"|"Review"|ratingValue|reviewCount|"Rating"/;

describe('JSON-LD builders', () => {
  it('organization has required fields', () => {
    const o = organization();
    expect(o['@context']).toBe('https://schema.org');
    expect(o['@type']).toBe('Organization');
    expect(o['@id']).toMatch(/#organization$/);
    expect(o.name).toBe('Crowsnest');
    expect(o.url).toMatch(/^https?:\/\//);
    expect(o.logo).toMatch(/^https?:\/\//);
    expect(o.sameAs).toEqual([REPO_URL]);
  });

  it('website has publisher and no SearchAction', () => {
    const w = website();
    expect(w['@type']).toBe('WebSite');
    expect(w.publisher).toEqual({ '@id': organization()['@id'] });
    expect(JSON.stringify(w)).not.toMatch(/SearchAction|potentialAction/);
  });

  it('software application is free, Apache licensed, no ratings', () => {
    const s = softwareApplication() as Record<string, any>;
    expect(s.applicationCategory).toBe('SecurityApplication');
    expect(s.description).toBe(ENTITY_DEFINITION);
    expect(s.offers.price).toBe('0');
    expect(s.offers.priceCurrency).toBeTruthy();
    expect(s.isAccessibleForFree).toBe(true);
    expect(s.license).toMatch(/^https?:\/\//);
    expect(s.codeRepository).toBe('https://github.com/devampatel03/Crowsnest');
    expect(JSON.stringify(s)).not.toMatch(RATINGS);
  });

  it('entity definition spells supply chain unhyphenated', () => {
    expect(ENTITY_DEFINITION).toContain('supply chain');
    expect(ENTITY_DEFINITION).not.toMatch(/supply-chain/i);
  });

  it('faqPage maps every item and fails on empty', () => {
    const f = faqPage([
      { question: 'What is it?', answer: 'A sentinel.' },
      { question: 'Is it free?', answer: 'Yes, Apache-2.0.' },
    ]) as Record<string, any>;
    expect(f.mainEntity).toHaveLength(2);
    expect(f.mainEntity[0]).toEqual({
      '@type': 'Question',
      name: 'What is it?',
      acceptedAnswer: { '@type': 'Answer', text: 'A sentinel.' },
    });
    expect(() => faqPage([])).toThrow();
  });

  it('howTo keeps step order, count and anchors', () => {
    const h = howTo(
      [
        { name: 'Clone', text: 'Clone the repo.', anchor: 'clone' },
        { name: 'Run', text: 'Run compose.' },
      ],
      { name: 'Run Crowsnest', path: '/docs/getting-started' },
    ) as Record<string, any>;
    expect(h.step.map((s: any) => s.position)).toEqual([1, 2]);
    expect(h.step[0].url).toMatch(/\/docs\/getting-started#clone$/);
    expect(h.step[1].url).toBeUndefined();
    expect(() => howTo([], { name: 'x' })).toThrow();
  });

  const article = {
    path: '/docs/coral-engine',
    headline: 'What is CoralEngine?',
    description: 'd'.repeat(150),
    updated: '2026-10-01',
    section: 'Architecture',
  };

  it('techArticle has required fields, falls back to Organization author', () => {
    const t = techArticle(article) as Record<string, any>;
    expect(t['@type']).toBe('TechArticle');
    expect(t.headline).toBe(article.headline);
    expect(t.datePublished).toBe('2026-10-01');
    expect(t.dateModified).toBe('2026-10-01');
    expect(t.author['@type']).toBe('Organization');
    expect(t.publisher).toEqual({ '@id': organization()['@id'] });
    expect(t.mainEntityOfPage).toMatch(/\/docs\/coral-engine$/);
    expect(t.inLanguage).toBe('en');
  });

  it('blogPosting requires author, published and image', () => {
    const p = {
      ...article,
      path: '/blog/x',
      published: '2026-09-01',
      author: 'A Writer',
      image: 'https://example.org/blog/x/opengraph-image',
    };
    const b = blogPosting(p) as Record<string, any>;
    expect(b['@type']).toBe('BlogPosting');
    expect(b.author).toEqual({ '@type': 'Person', name: 'A Writer' });
    expect(b.datePublished).toBe('2026-09-01');
    expect(b.dateModified).toBe('2026-10-01');
    expect(b.image).toBe(p.image);
    expect(() => blogPosting({ ...p, author: undefined })).toThrow(/author/);
    expect(() => blogPosting({ ...p, published: undefined })).toThrow(/published/);
  });

  it('definedTerm links to the glossary set', () => {
    const d = definedTerm({ path: '/glossary/slopsquatting', name: 'Slopsquatting', description: 'X is Y.' }) as Record<string, any>;
    expect(d['@type']).toBe('DefinedTerm');
    expect(d.inDefinedTermSet['@id']).toMatch(/\/glossary#terms$/);
    expect(d.url).toMatch(/\/glossary\/slopsquatting$/);
  });

  it('breadcrumbList is contiguous and absolute', () => {
    const b = breadcrumbsFor('/docs/integrations/slack', 'Slack bot') as Record<string, any>;
    const names = b.itemListElement.map((li: any) => li.name);
    expect(names).toEqual(['Crowsnest', 'Docs', 'Slack bot']);
    b.itemListElement.forEach((li: any, i: number) => {
      expect(li.position).toBe(i + 1);
      expect(li.item).toMatch(/^https?:\/\//);
    });
    expect(() => breadcrumbList([])).toThrow();
  });

  it('breadcrumb trail matches the JSON-LD names for several shapes', () => {
    expect(breadcrumbTrail('/docs', 'Docs').map((c) => c.name)).toEqual(['Crowsnest', 'Docs']);
    expect(breadcrumbTrail('/blog/a', 'A post').map((c) => c.name)).toEqual(['Crowsnest', 'Blog', 'A post']);
    expect(breadcrumbTrail('/about', 'About Crowsnest').map((c) => c.path)).toEqual(['/', '/about']);
    expect(breadcrumbTrail('/', 'x')).toHaveLength(1);
  });

  it('collectionPage embeds an ItemList and webPage about-links the software', () => {
    const c = collectionPage({ path: '/docs', name: 'Docs', description: 'd' }, [
      { name: 'A', path: '/docs/a' },
      { name: 'B', path: '/docs/b' },
    ]) as Record<string, any>;
    expect(c['@type']).toBe('CollectionPage');
    expect(c.mainEntity['@type']).toBe('ItemList');
    expect(c.mainEntity.itemListElement.map((x: any) => x.position)).toEqual([1, 2]);
    const a = webPage('AboutPage', { path: '/about', name: 'About', description: 'd' }, { aboutSoftware: true }) as Record<string, any>;
    expect(a.about).toEqual({ '@id': softwareApplication()['@id'] });
  });

  it('no builder ever emits ratings, reviews or SearchAction', () => {
    const all = [
      organization(),
      website(),
      softwareApplication(),
      faqPage([{ question: 'q', answer: 'a' }]),
      techArticle(article),
      definedTerm({ path: '/glossary/a', name: 'A', description: 'd' }),
      breadcrumbsFor('/docs/a', 'A'),
      webPage('WebPage', { path: '/privacy', name: 'Privacy', description: 'd' }),
    ];
    expect(JSON.stringify(all)).not.toMatch(RATINGS);
    expect(JSON.stringify(all)).not.toMatch(/SearchAction|potentialAction/);
  });

  it('mirroredStrings lists headline, description, FAQ and step text', () => {
    expect(mirroredStrings(techArticle(article))).toEqual([article.headline, article.description]);
    expect(
      mirroredStrings(faqPage([{ question: 'Q?', answer: 'A.' }])),
    ).toEqual(['Q?', 'A.']);
    expect(mirroredStrings(howTo([{ name: 'n', text: 't' }], { name: 'h' }))).toEqual(['n', 't']);
  });
});

describe('JSON-LD serialisation', () => {
  it('escapes < so a closing script tag cannot break out', () => {
    const out = serializeJsonLd({ text: '</script><script>alert(1)</script><!--' });
    expect(out).not.toContain('<');
    expect(out).toContain('\\u003c/script>');
    expect(JSON.parse(out).text).toBe('</script><script>alert(1)</script><!--');
  });

  it('escapes U+2028 and U+2029', () => {
    const out = serializeJsonLd({ t: 'a\u2028b\u2029c' });
    expect(out).not.toMatch(/[\u2028\u2029]/);
    expect(JSON.parse(out).t).toBe('a\u2028b\u2029c');
  });
});
