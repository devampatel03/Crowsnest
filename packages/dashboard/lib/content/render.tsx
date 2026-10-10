import type { ReactElement } from 'react';
import { mdxComponents } from '@/components/mdx';
import type { AnyEntry } from './loader';
import { dropLeadDuplicate, renderMdx, splitLead, type Heading } from './mdx';

export interface RenderedEntry {
  /** The answer-first lead (docs, compare), already rendered. */
  lead: ReactElement | null;
  /** Plain text of the lead, for places that need a string. */
  leadText: string | null;
  content: ReactElement;
  headings: Heading[];
}

/** The text that leads the page: `answer`, or for glossary the `definition`. */
function leadSource(entry: AnyEntry): string | undefined {
  if (entry.section === 'glossary') return entry.meta.definition;
  return entry.meta.answer;
}

/**
 * Render an entry for its page. The lead is taken from a `<Lead>` block when
 * the file has one, otherwise from the frontmatter answer (glossary:
 * definition); a first body paragraph that repeats it is dropped so the page
 * does not say the same sentence twice.
 */
export async function renderEntry(entry: AnyEntry): Promise<RenderedEntry> {
  let body = entry.body;
  let leadMd: string | null = null;
  let leadFormat: 'md' | 'mdx' = 'md';

  if (entry.format === 'mdx') {
    const split = splitLead(body);
    if (split.lead) {
      leadMd = split.lead;
      leadFormat = 'mdx';
      body = split.rest;
    }
  }
  const fm = leadSource(entry);
  if (!leadMd && fm) {
    leadMd = fm;
    body = dropLeadDuplicate(body, fm);
  }

  const lead = leadMd ? await renderMdx(leadMd, mdxComponents, leadFormat) : null;
  const main = await renderMdx(body, mdxComponents, entry.format);
  return {
    lead: lead ? lead.content : null,
    leadText: leadMd,
    content: main.content,
    headings: main.headings,
  };
}
