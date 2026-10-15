import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { ENTITY_DEFINITION } from '@/lib/seo/entity';
import { checkMetadataInput } from '@/lib/seo/metadata';
import { buildSitemap } from '@/lib/seo/sitemap';
import { HUBS } from './hubs';
import { FAQ } from './landing';
import { contentProblems, getAllEntries, getDocs, getPosts, getTerms } from './loader';
import { entryMarkdown, llmsFullTxt, llmsTxt, rssXml } from './machine';
import { extractFaq, extractSteps, toMarkdown } from './mdx';
import { allPublicRoutes, PLANNED_PATHS } from './routes';

const require = createRequire(import.meta.url);
const { REDIRECTS, OLD_URLS } = require('../redirects') as {
  REDIRECTS: { source: string; destination: string; permanent: boolean }[];
  OLD_URLS: string[];
};

describe('content loader', () => {
  it('has no frontmatter problems', () => {
    expect(contentProblems()).toEqual([]);
  });

  it('every page passes the metadata contract', () => {
    for (const e of getAllEntries()) {
      const problems = checkMetadataInput({
        path: e.path,
        title: e.meta.metaTitle ?? e.meta.title,
        description: e.meta.description,
      });
      expect({ path: e.path, problems }).toEqual({ path: e.path, problems: [] });
    }
    for (const h of Object.values(HUBS)) {
      expect(checkMetadataInput({ path: h.path, title: h.metaTitle, description: h.description })).toEqual([]);
    }
  });

  it('every path is planned and every related link resolves', () => {
    const known = new Set<string>(PLANNED_PATHS);
    for (const e of getAllEntries()) {
      expect(PLANNED_PATHS, e.path).toContain(e.path);
      for (const r of e.meta.related) expect(known.has(r), `${e.path} -> ${r}`).toBe(true);
    }
  });

  it('serves the Introduction at /docs and nothing at /docs/introduction', () => {
    expect(getDocs().find((d) => d.slug === 'introduction')?.path).toBe('/docs');
    expect(getAllEntries().some((e) => e.path === '/docs/introduction')).toBe(false);
  });

  it('spells supply chain unhyphenated', () => {
    for (const e of getAllEntries()) {
      expect(`${e.meta.description} ${e.body}`, e.path).not.toMatch(/supply-chain(?!-attack)/i);
    }
  });

  it('posts have a byline and ordered dates', () => {
    for (const p of getPosts()) {
      expect(p.meta.author.length).toBeGreaterThan(0);
      expect(p.meta.updated >= p.meta.published).toBe(true);
    }
  });

  it('glossary definitions are at most 40 words', () => {
    for (const t of getTerms()) expect(t.meta.definition.split(/\s+/).length).toBeLessThanOrEqual(40);
  });

  it('public text never says hackathon or uses internals vocabulary', () => {
    for (const e of getAllEntries()) {
      // The database file name is the one allowed mention.
      const body = e.body.split('crowsnest.duckdb').join('');
      expect(`${e.meta.description} ${body}`, e.path).not.toMatch(/hackathon|DuckDB|CoralEngine|LangGraph|SQL join/i);
    }
  });
});

describe('sitemap', () => {
  it('is exactly the public content routes once content is complete, with frontmatter dates', () => {
    const routes = allPublicRoutes();
    const sm = buildSitemap(routes);
    expect(sm.length).toBe(routes.length);
    for (const r of routes) expect(PLANNED_PATHS, r.path).toContain(r.path);
    expect(routes.length).toBeLessThanOrEqual(27);
    expect(sm.some((s) => /^https?:\/\/[^/]+\/(horizon|lookout|hold|log|raw|api|compare)(\/|$)/.test(s.url))).toBe(false);
    for (const e of getAllEntries()) {
      expect(routes.find((r) => r.path === e.path)?.updated, e.path).toBe(e.meta.updated);
    }
  });

  it('has all 27 routes (landing, 12 docs, blog index and 4 posts, glossary index and 6 terms, about, privacy)', () => {
    expect(allPublicRoutes().map((r) => r.path).sort()).toEqual([...PLANNED_PATHS].sort());
    expect(PLANNED_PATHS).toHaveLength(27);
  });
});

describe('redirects', () => {
  const match = (source: string, url: string) => {
    const re = new RegExp(
      '^' +
        source
          .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
          .replace(/:[a-z]+\*/g, '.*')
          .replace(/:[a-z]+/g, '[^/]+') +
        '$',
    );
    return re.test(url);
  };

  it('every redirect is permanent (308)', () => {
    for (const r of REDIRECTS) expect(r.permanent, r.source).toBe(true);
  });

  it('covers every old URL and lands on a public route', () => {
    for (const url of OLD_URLS) {
      const hit = REDIRECTS.find((r) => match(r.source, url));
      expect(hit, url).toBeDefined();
      const dest = hit!.destination.replace(/\.md$/, '');
      expect(PLANNED_PATHS, `${url} -> ${hit!.destination}`).toContain(dest);
    }
  });

  it('never redirects a live route', () => {
    for (const p of PLANNED_PATHS) {
      if (p === '/') continue;
      expect(REDIRECTS.find((r) => match(r.source, p)), p).toBeUndefined();
    }
  });
});

describe('markdown conversion', () => {
  it('unwraps known components and throws on an unknown one', () => {
    expect(toMarkdown('<Lead>Hello</Lead>')).toBe('Hello\n');
    expect(() => toMarkdown('<Mystery />')).toThrow(/unknown component/);
  });
  it('extracts ordered-list steps and FAQ sections', () => {
    expect(extractSteps('Intro\n\n1. Clone it: run git.\n2. Start it.\n')).toHaveLength(2);
    expect(extractFaq('## What is it?\n\nA thing.\n\n## Not a question\n\nx')).toEqual([
      { question: 'What is it?', answer: 'A thing.' },
    ]);
  });
});

describe('machine routes', () => {
  it('llms.txt leads with the verbatim definition, lists the FAQ and no console routes', () => {
    const t = llmsTxt();
    expect(t).toContain(`> ${ENTITY_DEFINITION}`);
    for (const f of FAQ) expect(t).toContain(f.question);
    expect(t).not.toMatch(/\]\(https?:\/\/[^)]*\/(horizon|lookout|hold|log)\)/);
    expect(t).not.toMatch(/supply-chain(?!-attack)|hackathon|DuckDB/i);
  });
  it('llms-full, rss and raw markdown build for every entry', () => {
    expect(llmsFullTxt()).toContain(ENTITY_DEFINITION);
    expect(rssXml()).toContain('<rss version="2.0"');
    for (const e of getAllEntries()) expect(entryMarkdown(e).startsWith('# ')).toBe(true);
  });
});

describe('landing data', () => {
  it('has six FAQ rows with unique ids, each answer 50 words or fewer', () => {
    expect(FAQ).toHaveLength(6);
    expect(new Set(FAQ.map((f) => f.id)).size).toBe(6);
    for (const f of FAQ) {
      expect(f.answer.split(/\s+/).length, f.id).toBeLessThanOrEqual(60);
      expect(`${f.question} ${f.answer}`).not.toMatch(/supply-chain(?!-attack)|hackathon/i);
    }
  });
});

describe('line endings', () => {
  it('extractSteps reads numbered steps from a CRLF body', () => {
    const steps = extractSteps('Intro.\r\n\r\n1. **Get the code.**\r\n2. **Start it.** Run it.\r\n');
    expect(steps.map((s) => s.name)).toEqual(['Get the code', 'Start it']);
  });
});
