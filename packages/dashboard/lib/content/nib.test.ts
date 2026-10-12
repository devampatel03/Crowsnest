import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getDocs, getPosts } from '@/lib/content/loader';
import { llmsFullTxt, llmsTxt } from '@/lib/content/machine';
import { BLOG_NIB_LINE, DOC_SIGNOFFS, DOC_SPOTS, FOOTER_SIGNOFF, GLOBAL_ERROR, GLOSSARY_NIB_LINE, MEET_NIB, NOT_FOUND, POST_COVERS, ROUTE_ERROR } from '@/lib/content/nib';
import { NIB_SENTENCE } from '@/lib/seo/entity';

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

describe("Nib's lines on the public site", () => {
  const lines = [
    FOOTER_SIGNOFF,
    BLOG_NIB_LINE,
    GLOSSARY_NIB_LINE,
    ...Object.values(DOC_SIGNOFFS),
    ...Object.values(POST_COVERS).map((c) => c.signoff),
    ...MEET_NIB.poses.map((p) => p.caption),
    NOT_FOUND.bubble,
    ROUTE_ERROR.bubble,
    GLOBAL_ERROR.bubble,
  ];

  it('are 14 words or fewer with no exclamation mark, emoji or oops', () => {
    for (const l of lines) {
      expect(words(l), l).toBeLessThanOrEqual(14);
      expect(l).not.toMatch(/!|oops|\p{Extended_Pictographic}/u);
    }
  });

  it('give every docs page a sign-off except Troubleshooting, and a spot for every page', () => {
    const slugs = getDocs().map((d) => d.slug);
    for (const s of slugs) {
      expect(DOC_SPOTS[s], `spot for ${s}`).toBeTruthy();
      if (s === 'troubleshooting') expect(DOC_SIGNOFFS[s]).toBeUndefined();
      else expect(DOC_SIGNOFFS[s], `sign-off for ${s}`).toBeTruthy();
    }
    expect(Object.keys(DOC_SIGNOFFS).every((k) => slugs.includes(k))).toBe(true);
  });

  it('give every post a cover with alt text under 125 characters', () => {
    for (const p of getPosts()) {
      const c = POST_COVERS[p.slug];
      expect(c, p.slug).toBeTruthy();
      expect(c.alt.length).toBeLessThanOrEqual(125);
    }
    // The Hold post has only the cover and its one sign-off (no body Nib material).
    const holdBody = getPosts().find((p) => p.slug === 'what-to-do-when-crowsnest-says-hold')!.body;
    expect(holdBody).not.toMatch(/\bNib\b/);
  });

  it('keep glossary term pages free of Nib', () => {
    const dir = join(process.cwd(), 'content', 'glossary');
    for (const f of readdirSync(dir)) expect(f).not.toMatch(/nib/i);
  });
});

describe('llms.txt and llms-full.txt', () => {
  it('name Nib as a drawing and list the settled facts', () => {
    for (const t of [llmsTxt(), llmsFullTxt()]) {
      expect(t).toContain(NIB_SENTENCE);
      expect(t).toContain('not on npm');
      expect(t).toContain('not on the Marketplace');
      expect(t).toContain('Known fault in 0.1.0');
      expect(t).toContain('Vercel Web Analytics');
      expect(t).not.toMatch(/hackathon|npm install -g/i);
    }
  });
});
