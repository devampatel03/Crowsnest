import { REPO_URL } from '@/lib/seo/constants';
import { getAllEntries, getDocs, type AnyEntry, type DocEntry } from './loader';
import type { LinkRowItem } from '@/components/site/blocks';

// Cross-links: related resolution, docs prev/next order, "Edit this page".

export const STATIC_TITLES: Record<string, { title: string; line: string }> = {
  '/': { title: 'Crowsnest', line: 'A lookout for the packages you install.' },
  '/docs': { title: 'Introduction', line: 'What Crowsnest is, who it is for, and how to read a call.' },
  '/blog': { title: 'Blog', line: 'Plain-language notes on keeping the packages you install safe.' },
  '/glossary': { title: 'Glossary', line: 'Six words you will meet when you install packages.' },
  '/about': { title: 'About', line: 'What Crowsnest is, the licence and where the code lives.' },
  '/privacy': { title: 'Privacy', line: 'What leaves your machine, and when.' },
};

function lineFor(e: AnyEntry): string {
  if (e.section === 'glossary') return e.meta.definition;
  if (e.section === 'blog') return e.meta.dek ?? e.meta.description;
  return e.meta.description;
}

function titleFor(e: AnyEntry): string {
  if (e.section === 'glossary') return e.meta.term;
  if (e.section === 'blog') return e.meta.h1 ?? e.meta.title;
  return e.meta.title;
}

/** Resolve `related` site paths to link rows. Unknown paths are skipped (the content test reports them). */
export function resolveRelated(paths: readonly string[]): LinkRowItem[] {
  const entries = getAllEntries();
  const out: LinkRowItem[] = [];
  for (const p of paths) {
    const e = entries.find((x) => x.path === p);
    if (e) {
      out.push({ title: titleFor(e), line: lineFor(e), href: e.path });
      continue;
    }
    const s = STATIC_TITLES[p];
    if (s) out.push({ title: s.title, line: s.line, href: p });
  }
  return out;
}

export interface NavDoc {
  title: string;
  href: string;
}

/** Sidebar order (group, then `order`). */
export function docNavOrder(docs: DocEntry[] = getDocs()): NavDoc[] {
  return docs.map((d) => ({ title: d.meta.title, href: d.path }));
}

export function neighbours(order: NavDoc[], href: string): { prev: NavDoc | null; next: NavDoc | null } {
  const i = order.findIndex((o) => o.href === href);
  if (i === -1) return { prev: null, next: null };
  return { prev: order[i - 1] ?? null, next: order[i + 1] ?? null };
}

/** GitHub URL of the file behind a page. */
export function editUrl(entry: AnyEntry): string {
  return `${REPO_URL}/blob/main/packages/dashboard/${entry.file}`;
}
