import { canonicalUrl } from '@/lib/site';
import { LICENSE_NAME, NEW_ISSUE_URL, REPO_URL, VERSION } from '@/lib/seo/constants';
import { ENTITY_DEFINITION, ENTITY_NAME, ENTITY_NOT, NIB_SENTENCE } from '@/lib/seo/entity';
import { FAQ } from './landing';
import { getAllEntries, getDocs, getPosts, getTerms, type AnyEntry } from './loader';
import { toMarkdown } from './mdx';
import { siteLastUpdated } from './routes';

// Generators for llms.txt, llms-full.txt, rss.xml and raw .md (brief 9,
// 02-copy section 11). Everything is built from the content files and the
// landing FAQ; no counts or claims are typed here.

const abs = (p: string) => canonicalUrl(p);

function titleOf(e: AnyEntry): string {
  if (e.section === 'glossary') return e.meta.term;
  return e.meta.h1 ?? e.meta.title;
}

export function entryMarkdown(e: AnyEntry): string {
  const body = toMarkdown(e.body, e.file);
  const dateLine =
    e.section === 'blog'
      ? `Published ${e.meta.published}. Updated ${e.meta.updated}. By ${e.meta.author}.`
      : `Updated ${e.meta.updated}.`;
  const facts = e.meta.facts?.length ? `\n## Quotable facts\n\n${e.meta.facts.map((f) => `- ${f}`).join('\n')}\n` : '';
  const lead = e.section === 'glossary' ? `\n${e.meta.definition}\n` : '';
  return `# ${titleOf(e)}\n\n${dateLine}\n${lead}${facts}\n${body}\nSource: ${abs(e.path)}\n`;
}

function list(entries: AnyEntry[]): string {
  return entries.map((e) => `- [${titleOf(e)}](${abs(e.path)}): ${e.meta.description}`).join('\n');
}

/** 02-copy v3 section 11. Every line is a repo-supported fact or a dated observation. */
const FACTS: string[] = [
  `Who Nib is. ${NIB_SENTENCE} Nib does not appear in the command line tool, the Slack bot or the VS Code extension.`,
  'Four ways to use it: the crowsnest command in a terminal, a VS Code extension, a Slack bot and a dashboard at http://localhost:3000.',
  'Not published: the command line tool is not on npm and the VS Code extension is not on the Marketplace. Both are built from source.',
  'Every call is Clear, Watch or Hold, with a plain sentence for what happened and a first step. "No flags" is not the same as Clear.',
  '`crowsnest install <package>` stops at risk 0.6 or above and on any known harmful package. The limit is fixed. A plain `npm install` is not checked. If Crowsnest cannot be reached, the install proceeds with a warning.',
  'The install check looks at how new the package is (under 30 days), weekly downloads (under 1,000), a link to a code repository, a name close to a package with over 1,000,000 weekly downloads, names AI assistants are known to invent, and known harmful packages.',
  'Known fault in 0.1.0: a scan on a fresh install with no API keys failed in a real run on 2026-10-07. `crowsnest install <package>` and `/health` worked the same day. See ' +
    abs('/docs/troubleshooting') +
    '.',
  'Docker image note, as of 2026-10-07: the built-in lists of known harmful packages and known AI-invented names were empty in a fresh Docker container, so those two checks have nothing to match there.',
  'Every API key is optional. Without keys Crowsnest uses cached data. Optional: Anthropic, GitHub, Socket, npm. Slack keys are needed only for the bot.',
  'Requirements: Docker, or Python 3.12+ and Node 18+. Crowsnest listens on port 8000 and the dashboard on port 3000.',
  'Slack has four commands: `/crowsnest-scan`, `/crowsnest-investigate`, `/crowsnest-blast-radius` and `/crowsnest-status`. It posts only the most serious calls to `#security` by default.',
  'VS Code covers JavaScript, TypeScript, JSX, TSX and Python. It warns from risk 0.5 by default (`crowsnest.riskThreshold`), waits 1 second after typing and remembers a result for 5 minutes.',
  'Lockfiles and results stay on your machine. Optional calls to Anthropic, Socket and GitHub happen only when you set a key. Crowsnest sends no usage data to its authors. The website runs no analytics and sets no cookies.',
];

function faqSection(): string {
  return FAQ.map((f) => `### ${f.question}\n\n${f.answer}`).join('\n\n');
}

export function llmsTxt(): string {
  const parts = [
    `# ${ENTITY_NAME}`,
    `> ${ENTITY_DEFINITION}`,
    `Open source (${LICENSE_NAME}), you run it yourself, no account. Version ${VERSION}, not released yet. Source: ${REPO_URL}. Last updated ${siteLastUpdated()}.`,
    `## What it is not\n\n${ENTITY_NOT.map((n) => `- ${n}`).join('\n')}`,
    `## Facts worth getting right\n\n${FACTS.map((f) => `- ${f}`).join('\n')}`,
    `## Questions\n\n${faqSection()}`,
    `## Docs\n\n${list(getDocs())}`,
    `## Blog\n\n${list(getPosts())}`,
    `## Glossary\n\n${list(getTerms())}`,
    `## Optional\n\n- [About](${abs('/about')})\n- [Privacy](${abs('/privacy')})\n- [Report a problem](${NEW_ISSUE_URL})\n- [Full text of these pages](${abs('/llms-full.txt')})\n- [RSS](${abs('/rss.xml')})`,
    'This site welcomes indexing and citation of the public pages. The dashboard routes (/horizon, /lookout, /hold, /log) show one installation data and are excluded. Cite the definition above and the page under /docs or /glossary that matches the question. Each content page is also available as Markdown by adding .md to its URL.',
  ];
  return parts.join('\n\n') + '\n';
}

export function llmsFullTxt(): string {
  const parts = [`${ENTITY_DEFINITION}\n\nLast updated ${siteLastUpdated()}. Source: ${REPO_URL}.`, `# Facts worth getting right\n\n${FACTS.map((f) => `- ${f}`).join('\n')}`, `# Questions\n\n${faqSection()}`];
  for (const e of getAllEntries()) parts.push(entryMarkdown(e));
  return parts.join('\n\n---\n\n');
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function rssXml(): string {
  const posts = getPosts();
  const items = posts
    .map(
      (p) => `    <item>
      <title>${esc(titleOf(p))}</title>
      <link>${abs(p.path)}</link>
      <guid isPermaLink="true">${abs(p.path)}</guid>
      <pubDate>${new Date(`${p.meta.published}T00:00:00Z`).toUTCString()}</pubDate>
      <description>${esc(p.meta.answer ?? p.meta.description)}</description>
    </item>`,
    )
    .join('\n');
  const last = posts.length ? posts.map((p) => p.meta.updated).sort().at(-1)! : siteLastUpdated();
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Crowsnest blog</title>
    <link>${abs('/blog')}</link>
    <atom:link href="${abs('/rss.xml')}" rel="self" type="application/rss+xml" />
    <description>Plain-language notes on keeping the packages you install safe.</description>
    <language>en</language>
    <lastBuildDate>${new Date(`${last}T00:00:00Z`).toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`;
}
