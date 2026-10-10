import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import {
  validateFrontmatter,
  type ContentSection,
  type DocMeta,
  type MetaFor,
  type PostMeta,
  type SchemaProblem,
  type TermMeta,
} from './schema';

// Filesystem content loader (server only). Reads content/{docs,blog,glossary}
// /**/*.{mdx,md}, validates frontmatter, and returns typed entries. A missing
// or empty directory yields an empty list (the content folder is filled in
// over time); an invalid file is a problem, and problems fail a production
// build.

export const CONTENT_ROOT = path.join(process.cwd(), 'content');

export interface ContentEntry<S extends ContentSection> {
  section: S;
  /** Slug relative to the section root, e.g. "quickstart" or "integrations/slack". */
  slug: string;
  /** Public site path, e.g. "/docs/integrations/slack". The docs Introduction is "/docs". */
  path: string;
  meta: MetaFor<S>;
  /** MDX/Markdown body without frontmatter. */
  body: string;
  /** Path relative to the package root, forward slashes (used for "Edit this page"). */
  file: string;
  readingMinutes: number;
  /** `md` is rendered as plain Markdown, `mdx` as MDX (components allowed). */
  format: 'md' | 'mdx';
}

export type DocEntry = ContentEntry<'docs'>;
export type PostEntry = ContentEntry<'blog'>;
export type TermEntry = ContentEntry<'glossary'>;

const EXT = /\.(mdx|md)$/;

/** The docs Introduction lives at the section root, not at /docs/introduction. */
export const INTRO_SLUG = 'introduction';

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (EXT.test(e.name) && !e.name.startsWith('_')) out.push(full);
  }
  return out.sort();
}

/** Words / 200, rounded up, minimum 1 (the copy deck estimates at about 200 words a minute). */
export function readingMinutes(body: string): number {
  const words = body
    .replace(/```[\s\S]*?```/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

const SECTION_PATH_PREFIX: Record<ContentSection, string> = {
  docs: '/docs',
  blog: '/blog',
  glossary: '/glossary',
};

/** Integration pages live at /docs/integrations/<name>; accept a bare slug when the section says Integrations. */
export function normalizeSlug(section: ContentSection, slug: string, docSection?: string): string {
  if (section === 'docs' && docSection?.trim().toLowerCase() === 'integrations' && !slug.startsWith('integrations/')) {
    return `integrations/${slug}`;
  }
  return slug;
}

function pathFor(section: ContentSection, slug: string): string {
  if (section === 'docs' && slug === INTRO_SLUG) return '/docs';
  return `${SECTION_PATH_PREFIX[section]}/${slug}`;
}

interface Loaded<S extends ContentSection> {
  entries: ContentEntry<S>[];
  problems: SchemaProblem[];
}

export function loadSection<S extends ContentSection>(section: S, root = CONTENT_ROOT): Loaded<S> {
  const dir = path.join(root, section);
  const entries: ContentEntry<S>[] = [];
  const problems: SchemaProblem[] = [];
  const seen = new Map<string, string>();

  for (const full of walk(dir)) {
    const rel = path.relative(dir, full).split(path.sep).join('/');
    const file = path.relative(process.cwd(), full).split(path.sep).join('/');
    const fallbackSlug = rel.replace(EXT, '').replace(/\/index$/, '');
    let parsed: matter.GrayMatterFile<string>;
    try {
      parsed = matter(fs.readFileSync(full, 'utf8'));
    } catch (err) {
      problems.push({ file, message: `unreadable frontmatter: ${(err as Error).message}` });
      continue;
    }
    const result = validateFrontmatter(section, parsed.data, file, fallbackSlug);
    problems.push(...result.problems);
    if (!result.meta) continue;
    const meta = result.meta;
    const docSection = section === 'docs' ? (meta as DocMeta).section : undefined;
    const slug = normalizeSlug(section, meta.slug, docSection);
    meta.slug = slug;
    const clash = seen.get(slug);
    if (clash) {
      problems.push({ file, message: `duplicate slug "${slug}" (also ${clash})` });
      continue;
    }
    seen.set(slug, file);
    entries.push({
      section,
      slug,
      path: pathFor(section, slug),
      meta,
      body: parsed.content,
      file,
      readingMinutes: readingMinutes(parsed.content),
      format: full.endsWith('.mdx') ? 'mdx' : 'md',
    });
  }
  return { entries, problems };
}

const cache = new Map<ContentSection, Loaded<ContentSection>>();

function get<S extends ContentSection>(section: S): Loaded<S> {
  // No cache in dev so edits to content files show without a restart.
  if (process.env.NODE_ENV !== 'production') return loadSection(section);
  let hit = cache.get(section) as Loaded<S> | undefined;
  if (!hit) {
    hit = loadSection(section);
    cache.set(section, hit as Loaded<ContentSection>);
    if (hit.problems.length > 0 && process.env.NEXT_PHASE === 'phase-production-build') {
      throw new Error(
        `content: ${hit.problems.length} problem(s) in content/${section}:\n` +
          hit.problems.map((p) => `  ${p.file}: ${p.message}`).join('\n'),
      );
    }
  }
  return hit;
}

/** Every validation problem across all sections (the content test asserts this is empty). */
export function contentProblems(root = CONTENT_ROOT): SchemaProblem[] {
  return (['docs', 'blog', 'glossary'] as const).flatMap((s) => loadSection(s, root).problems);
}

/** Sidebar groups in order (brief 8.2). Compared case-insensitively against frontmatter `section`. */
export const DOC_GROUP_ORDER = ['get started', 'use', 'integrations', 'reference', 'help', 'community'] as const;

function groupRank(section: string): number {
  const i = (DOC_GROUP_ORDER as readonly string[]).indexOf(section.trim().toLowerCase());
  return i === -1 ? DOC_GROUP_ORDER.length : i;
}

/** Docs in sidebar order: group order, then `order`, then title. */
export function getDocs(): DocEntry[] {
  return [...get('docs').entries].sort(
    (a, b) =>
      groupRank(a.meta.section) - groupRank(b.meta.section) ||
      a.meta.order - b.meta.order ||
      a.meta.title.localeCompare(b.meta.title),
  );
}
export const getDoc = (slug: string): DocEntry | undefined => getDocs().find((d) => d.slug === slug);
export const getIntroduction = (): DocEntry | undefined => getDoc(INTRO_SLUG);

/** Newest first by `published`. */
export function getPosts(): PostEntry[] {
  return [...get('blog').entries].sort(
    (a, b) => b.meta.published.localeCompare(a.meta.published) || a.meta.order - b.meta.order,
  );
}
export const getPost = (slug: string): PostEntry | undefined => getPosts().find((p) => p.slug === slug);

export function getTerms(): TermEntry[] {
  return [...get('glossary').entries].sort(
    (a, b) => a.meta.order - b.meta.order || a.meta.term.localeCompare(b.meta.term),
  );
}
export const getTerm = (slug: string): TermEntry | undefined => getTerms().find((t) => t.slug === slug);

export type AnyEntry = DocEntry | PostEntry | TermEntry;

export function getAllEntries(): AnyEntry[] {
  return [...getDocs(), ...getPosts(), ...getTerms()];
}

/** Resolve a site path to a content entry, or undefined. */
export function findByPath(sitePath: string): AnyEntry | undefined {
  return getAllEntries().find((e) => e.path === sitePath);
}

export type { DocMeta, PostMeta, TermMeta };
