import { render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { parseJsonLd } from '@/test/jsonld-extract';
import { FAQ, HERO, HOW, INSTALL, TRY } from '@/lib/content/landing';
import { ENTITY_DEFINITION } from '@/lib/seo/entity';
import { EXPECTED_TYPES } from '@/lib/seo/expected-types';
import { mirroredStrings } from '@/lib/seo/jsonld';
import { SAMPLES, scoreSample } from '@/lib/sandbox';
import Landing from './page';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ');

describe('Landing page', () => {
  const html = renderToStaticMarkup(<Landing />);

  it('has exactly one h1 and five bearing sections in order', () => {
    const { container } = render(<Landing />);
    expect(container.querySelectorAll('h1')).toHaveLength(1);
    const ids = [...container.querySelectorAll('section[data-bearing]')].map((s) => s.id);
    expect(ids).toEqual(['top', 'how', 'try', 'install', 'faq']);
  });

  it('has one primary action that scrolls to #install', () => {
    const { container } = render(<Landing />);
    const cta = container.querySelector('#hero-cta');
    expect(cta?.getAttribute('href')).toBe('#install');
    expect(cta?.textContent).toContain('Install Crowsnest');
  });

  it('shows the real sandbox weights and exactly three samples', () => {
    expect(SAMPLES.map((s) => s.name)).toEqual(['tidy-dates', 'fast-csv-lite', 'quikrequest']);
    expect(SAMPLES.map((s) => scoreSample(s).score)).toEqual([0, 0.5, 1]);
    expect(SAMPLES.map((s) => scoreSample(s).word)).toEqual(['Clear', 'Watch', 'Hold']);
    expect(scoreSample(SAMPLES[2]).raw).toBe(1.05);
    expect(html).toContain('Sample data, not real packages.');
  });

  it('leads the sandbox with the call word and shows no scores, totals or thresholds', () => {
    const t = text(html);
    expect(t).not.toMatch(/Total \d|capped|starts to show|install stops at|\+0\.\d\d|\b1\.00\b/);
    expect(t).toContain('Almost nobody downloads it.');
    expect(text(html)).toContain('Version 0.1.0 is early. A first scan on a fresh install can fail when no API keys are set. Troubleshooting has the details.');
    expect(html).toContain('href="/docs/troubleshooting"');
  });

  it('puts the answers, install commands and bearing labels in server HTML', () => {
    for (const f of FAQ) expect(text(html)).toContain(f.answer);
    for (const r of INSTALL.rows) expect(text(html)).toContain(r.command);
    for (const d of ['000°', '072°', '144°', '216°', '288°']) expect(html).toContain(d);
    // The degrees are not visible labels: they sit in sr-only text and titles only.
    expect(html).not.toMatch(/class="bearing/);
  });

  it('has Nib in the first section: the lookout hero, a bubble, the bell button and the sky', () => {
    const { container } = render(<Landing />);
    expect(container.querySelector('h1')?.textContent).toBe(HERO.h1);
    const bell = container.querySelector('button[data-nib-btn]');
    expect(bell?.getAttribute('aria-label')).toBe("Ring Nib's bell");
    expect(container.querySelector('[data-bubble-text]')?.textContent).toBe(HERO.restBubble);
    expect(container.querySelector('[data-sky]')).not.toBeNull();
    // The Primary comes before Nib's button in tab order.
    const all = [...container.querySelectorAll('a, button')];
    expect(all.indexOf(container.querySelector('#hero-cta')!)).toBeLessThan(all.indexOf(bell!));
    // The three sighted marks carry their call text for the client island.
    const marks = [...container.querySelectorAll('[data-mark]')];
    expect(marks.map((m) => m.getAttribute('data-level'))).toEqual(['clear', 'watch', 'hold']);
    expect(marks[2].getAttribute('data-bubble')).toBe('');
  });

  it('draws the five-panel strip with real captions and the text equivalent in the DOM', () => {
    const { container } = render(<Landing />);
    const strip = container.querySelector('figure.nib-strip');
    expect(strip?.querySelectorAll('li svg')).toHaveLength(5);
    expect([...strip!.querySelectorAll('li p')].map((p) => p.textContent)).toEqual([...HOW.captions]);
    expect(strip?.querySelector('figcaption')?.textContent).toBe(HOW.stripAlt);
    expect(strip?.querySelector('h3')?.textContent).toBe(HOW.stripTitle);
    for (const c of HOW.captions) expect(c.split(/\s+/).length).toBeLessThanOrEqual(14);
  });

  it('keeps every Nib line short, calm and joke-free beside a Hold', () => {
    const lines = [
      HERO.restBubble,
      ...HERO.bellLines,
      ...Object.values(HERO.markBubbles),
      ...HOW.captions,
      ...Object.values(TRY.nib).flatMap((n) => [n.bubble, n.note]),
      INSTALL.haulCaption,
    ];
    for (const l of lines) {
      expect(l.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(14);
      expect(l).not.toMatch(/!|oops|\p{Extended_Pictographic}/u);
    }
    // Hold sample: the bubble is the whitelisted line and there is no note.
    expect(TRY.nib.quikrequest.bubble).toBe('Hold. Not this one.');
    expect(TRY.nib.quikrequest.note).toBe('');
    // A Hold mark shows no bubble: the call line stands alone.
    expect(HERO.markBubbles.t9).toBe('');
  });

  it('keeps Nib out of the JSON-LD (no Person, no mascot markup)', () => {
    const blocks = parseJsonLd(html);
    expect(JSON.stringify(blocks)).not.toMatch(/"Person"|Nib/);
  });

  it('never ships internals vocabulary, hackathon wording or competitor claims', () => {
    const t = text(html);
    expect(t).not.toMatch(/hackathon|DuckDB|SQL|template|pipeline|LangGraph|Dependabot|Snyk/i);
    expect(t).not.toMatch(/npm install -g/i);
  });

  it('emits parseable JSON-LD with the expected types, mirrored by visible text', () => {
    const blocks = parseJsonLd(html);
    const types = blocks.map((b) => b['@type']);
    for (const t of EXPECTED_TYPES.landing) expect(types).toContain(t);
    const faq = blocks.find((b) => b['@type'] === 'FAQPage') as { mainEntity: unknown[] };
    expect(faq.mainEntity).toHaveLength(FAQ.length);
    const software = blocks.find((b) => b['@type'] === 'SoftwareApplication') as { description: string };
    expect(software.description).toBe(ENTITY_DEFINITION);
    const t = text(html);
    for (const b of blocks.filter((x) => ['FAQPage', 'HowTo'].includes(String(x['@type'])))) {
      for (const s of mirroredStrings(b)) expect(t).toContain(s.replace(/\s+/g, ' '));
    }
  });
});
