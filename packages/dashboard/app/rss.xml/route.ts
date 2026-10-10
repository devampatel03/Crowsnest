import { rssXml } from '@/lib/content/machine';

export const dynamic = 'force-static';

export function GET() {
  return new Response(rssXml(), { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
}
