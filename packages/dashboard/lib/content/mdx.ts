import { evaluate } from '@mdx-js/mdx';
import * as runtime from 'react/jsx-runtime';
import remarkGfm from 'remark-gfm';
import type { ComponentType, ReactElement } from 'react';
import { createElement } from 'react';

// MDX rendering and plain-Markdown conversion (server only).
//
// `renderMdx` compiles at request/build time with @mdx-js/mdx `evaluate`
// (no webpack loader, no pageExtensions change), adds ids to h2 and h3, and
// returns the h2/h3 outline for the on-page TOC and the Bearing Rule.
// `toMarkdown` is the raw `.md` / llms-full.txt representation of the same
// source: JSX is replaced by text equivalents, and an unknown JSX tag THROWS so
// nothing silently disappears (02-search-plan 6).

export interface Heading {
  id: string;
  text: string;
  level: 2 | 3;
}

type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

function nodeText(node: HastNode): string {
  if (node.type === 'text') return node.value ?? '';
  return (node.children ?? []).map(nodeText).join('');
}

/** GitHub-style slug: lowercase, drop punctuation, spaces to hyphens. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Rehype plugin factory: assigns ids to h2/h3 and records them. */
function rehypeHeadings(sink: Heading[]) {
  return () => (tree: HastNode) => {
    const used = new Map<string, number>();
    const visit = (node: HastNode) => {
      if (node.type === 'element' && (node.tagName === 'h2' || node.tagName === 'h3')) {
        const text = nodeText(node).trim();
        let id = slugify(text) || 'section';
        const n = used.get(id) ?? 0;
        used.set(id, n + 1);
        if (n > 0) id = `${id}-${n}`;
        node.properties = { ...(node.properties ?? {}), id };
        sink.push({ id, text, level: node.tagName === 'h2' ? 2 : 3 });
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}

export interface RenderedMdx {
  content: ReactElement;
  headings: Heading[];
}

export async function renderMdx(
  source: string,
  components: Record<string, ComponentType<never> | ComponentType<Record<string, unknown>> | string>,
  /** `.md` files are parsed as plain Markdown (so `<path>` in prose is text, not JSX); `.mdx` as MDX. */
  format: 'md' | 'mdx' = 'mdx',
): Promise<RenderedMdx> {
  const headings: Heading[] = [];
  const mod = await evaluate(source, {
    ...(runtime as unknown as Record<string, unknown>),
    format,
    remarkPlugins: [remarkGfm],
    rehypePlugins: [rehypeHeadings(headings)],
    development: false,
  } as unknown as Parameters<typeof evaluate>[1]);
  const Content = mod.default as ComponentType<{ components?: unknown }>;
  return { content: createElement(Content, { components }), headings };
}

// ---------------------------------------------------------------------------
// Markdown conversion
// ---------------------------------------------------------------------------

/** Components that may appear in content. Anything else throws in toMarkdown. */
export const KNOWN_COMPONENTS = ['Lead', 'Note'] as const;

/** MDX source to plain Markdown. Frontmatter must already be stripped. */
export function toMarkdown(source: string, file = 'content'): string {
  // Protect fenced code from JSX handling.
  const fences: string[] = [];
  let text = source.replace(/```[^]*?```/g, (m) => {
    fences.push(m);
    return `\u0000FENCE${fences.length - 1}\u0000`;
  });

  // import / export statements (single line).
  text = text.replace(/^\s*(import|export)\s.+$/gm, '');

  // Wrapper components: keep their children.
  text = text.replace(/<\/?(Lead|Note)\b[^>]*>/g, '');

  // Any remaining capitalised JSX tag is unknown. (Lower-case HTML is left alone.)
  const unknown = /<([A-Z][A-Za-z0-9]*)\b/.exec(text);
  if (unknown) throw new Error(`${file}: unknown component <${unknown[1]}> cannot be converted to Markdown`);

  text = text.replace(/\u0000FENCE(\d+)\u0000/g, (_, i) => fences[Number(i)]);
  return text.replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

/** First paragraph of a body, plain text, for lead fallbacks and llms. */
export function firstParagraph(source: string): string {
  const blocks = source
    .replace(/^\s*(import|export)\s.+$/gm, '')
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter((b) => b && !b.startsWith('#') && !b.startsWith('```') && !b.startsWith('|'));
  const first = blocks[0] ?? '';
  return first
    .replace(/<\/?[A-Za-z][^>]*>/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[`*_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Body helpers
// ---------------------------------------------------------------------------

/** Pull the first <Lead>...</Lead> block out of the body so the page can place it above the facts panel. */
export function splitLead(body: string): { lead: string | null; rest: string } {
  const m = /<Lead>([^]*?)<\/Lead>/.exec(body);
  if (!m) return { lead: null, rest: body };
  return { lead: m[1].trim(), rest: (body.slice(0, m.index) + body.slice(m.index + m[0].length)).trim() };
}

/** Plain text of a Markdown/MDX fragment (links unwrapped, markup dropped). */
export function plainText(md: string): string {
  return md
    .replace(/<\/?[A-Za-z][^>]*>/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[`*_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface StepSource {
  name: string;
  text: string;
}

/**
 * Steps for HowTo JSON-LD: the items of the first ordered list in the body.
 * `text` is the visible item text (markup stripped); `name` is its first
 * sentence or clause, so both mirror what the page shows.
 */
export function extractSteps(body: string): StepSource[] {
  const lines = body.split(/\r?\n/);
  const items: string[] = [];
  let inFence = false;
  let started = false;
  for (const line of lines) {
    if (line.trimStart().startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^\s{0,3}\d+[.)]\s+(.*)$/.exec(line);
    if (m) {
      started = true;
      items.push(m[1]);
    } else if (started) {
      if (/^\s{2,}\S/.test(line) && items.length) items[items.length - 1] += ' ' + line.trim();
      else if (!line.trim()) continue;
      else break;
    }
  }
  return items.map((raw) => {
    const text = plainText(raw);
    const name = /^(.+?)(?:: |\.\s|\.$)/.exec(text)?.[1]?.trim() || text;
    return { name, text };
  });
}

export interface FaqSource {
  question: string;
  answer: string;
}

/** FAQ items from `## Question?` sections: answer = plain text of the section body. */
export function extractFaq(body: string): FaqSource[] {
  const out: FaqSource[] = [];
  const parts = body.split(/^##\s+/m).slice(1);
  for (const part of parts) {
    const nl = part.indexOf('\n');
    const question = plainText(nl === -1 ? part : part.slice(0, nl));
    if (!question.endsWith('?')) continue;
    const answer = plainText((nl === -1 ? '' : part.slice(nl + 1)).replace(/```[^]*?```/g, ' '));
    if (answer) out.push({ question, answer });
  }
  return out;
}

/** Drop the first paragraph of the body when it repeats the frontmatter answer (the lead is rendered separately). */
export function dropLeadDuplicate(body: string, answer: string | undefined): string {
  if (!answer) return body;
  const norm = (t: string) => plainText(t).replace(/\s+/g, ' ');
  const trimmed = body.replace(/^\s+/, '');
  const end = trimmed.search(/\n\s*\n/);
  const first = end === -1 ? trimmed : trimmed.slice(0, end);
  if (norm(first) === norm(answer)) return end === -1 ? '' : trimmed.slice(end).trimStart();
  return body;
}
