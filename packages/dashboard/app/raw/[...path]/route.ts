import { findByPath, getAllEntries } from '@/lib/content/loader';
import { entryMarkdown } from '@/lib/content/machine';

// Raw Markdown for every content page, reached by rewrites from `<page>.md`
// (next.config.js). Not indexable: robots.txt disallows /raw and the response
// carries X-Robots-Tag: noindex.
export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return getAllEntries().map((e) => ({ path: e.path.slice(1).split('/') }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const entry = findByPath('/' + path.join('/'));
  if (!entry) return new Response('Not found', { status: 404 });
  return new Response(entryMarkdown(entry), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'X-Robots-Tag': 'noindex' },
  });
}
