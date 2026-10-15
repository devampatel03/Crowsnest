import { AUTHOR_NAME } from '@/lib/seo/constants';
import type { DocFrontmatter, GlossaryFrontmatter, PostFrontmatter } from '@/lib/seo/types';

// Frontmatter contract for content/{docs,blog,glossary}/**/*.mdx|md. The base
// shapes live in lib/seo/types.ts. This file adds the loader-level extras and
// the runtime validation. Extra, unknown keys are allowed and ignored.
//
// Slugs are relative to the section root: content/docs/quickstart.md has slug
// "quickstart"; the Slack page is "integrations/slack" (the loader also
// accepts the bare "slack" when `section` is "Integrations"). The docs
// Introduction (slug "introduction") is served at /docs.

export type ContentSection = 'docs' | 'blog' | 'glossary';

/** Fields every kind may carry on top of the seo/types.ts shapes. */
export interface ContentExtras {
  /** Answer-first block, plain text, <= 50 words. Rendered as the lead / answer box. */
  answer?: string;
  /** The question a page answers. */
  question?: string;
  /** Quotable facts (3 to 6 strings). Rendered in the facts panel and llms-full. */
  facts?: string[];
}

export type DocMeta = DocFrontmatter & ContentExtras;
export type PostMeta = PostFrontmatter & ContentExtras;
export type TermMeta = GlossaryFrontmatter & ContentExtras;

export type MetaFor<S extends ContentSection> = S extends 'docs' ? DocMeta : S extends 'blog' ? PostMeta : TermMeta;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface SchemaProblem {
  file: string;
  message: string;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** YAML turns bare 2026-10-06 into a Date; normalise back to the ISO day. */
export function isoDay(v: unknown): string | undefined {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = str(v);
  return s && ISO_DATE.test(s) ? s : undefined;
}

function strList(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim());
}

export interface ValidateResult<S extends ContentSection> {
  meta?: MetaFor<S>;
  problems: SchemaProblem[];
}

/**
 * Validate and normalise raw frontmatter. Problems are collected rather than
 * thrown so the loader can report every bad file at once.
 */
export function validateFrontmatter<S extends ContentSection>(
  section: S,
  raw: Record<string, unknown>,
  file: string,
  fallbackSlug: string,
): ValidateResult<S> {
  const problems: SchemaProblem[] = [];
  const need = (message: string) => problems.push({ file, message });

  const title = str(raw.title);
  const description = str(raw.description);
  const slugRaw = str(raw.slug) ?? fallbackSlug;
  const updated = isoDay(raw.updated);
  const order = typeof raw.order === 'number' ? raw.order : 999;
  const related = strList(raw.related) ?? [];

  if (!title) need('missing `title`');
  if (!description) need('missing `description`');
  if (!updated) need('missing or non-ISO `updated` (YYYY-MM-DD)');
  if (!slugRaw) need('missing `slug`');
  for (const r of related) {
    if (!r.startsWith('/')) need(`related entry "${r}" must be a site path starting with "/"`);
  }

  const base = {
    title: title ?? '',
    description: description ?? '',
    slug: slugRaw.replace(/^\/+|\/+$/g, ''),
    order,
    updated: updated ?? '',
    related,
    ...(str(raw.h1) ? { h1: str(raw.h1) } : {}),
    ...(str(raw.metaTitle) ? { metaTitle: str(raw.metaTitle) } : {}),
    ...(str(raw.answer) ? { answer: str(raw.answer) } : {}),
    ...(str(raw.question) ? { question: str(raw.question) } : {}),
    ...(strList(raw.facts) ? { facts: strList(raw.facts) } : {}),
  };

  let meta: unknown;
  if (section === 'docs') {
    const sec = str(raw.section);
    if (!sec) need('missing `section`');
    meta = { ...base, section: sec ?? '', ...(raw.howTo === true ? { howTo: true } : {}) };
  } else if (section === 'blog') {
    const published = isoDay(raw.published ?? raw.date);
    if (!published) need('missing or non-ISO `published` (or `date`)');
    if (published && updated && updated < published) need('`updated` is earlier than `published`');
    meta = {
      ...base,
      published: published ?? '',
      // No named author: the byline is the project.
      author: str(raw.author) ?? AUTHOR_NAME,
      ...(str(raw.dek) ? { dek: str(raw.dek) } : {}),
      ...(str(raw.status) === 'draft-until-tagged' ? { status: 'draft-until-tagged' as const } : {}),
    };
  } else {
    const term = str(raw.term);
    const definition = str(raw.definition);
    if (!term) need('missing `term`');
    if (!definition) need('missing `definition`');
    if (definition && definition.split(/\s+/).length > 40) need('`definition` is longer than 40 words');
    meta = { ...base, term: term ?? '', definition: definition ?? '' };
  }

  // One day of slack so a UTC build never rejects a date written in a timezone ahead of UTC.
  const today = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  if (updated && updated > today) need(`\`updated\` ${updated} is in the future`);

  return { meta: problems.length ? undefined : (meta as MetaFor<S>), problems };
}
