import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  ComicStrip,
  EmptyNib,
  ErrorNib,
  FirstRunStrip,
  LoadingNib,
  NIB_POSES,
  NotFoundNib,
  Nib,
  NibMini,
  OfflineNib,
  SuccessNib,
  nibIconSvg,
} from './index';

const MAX_BYTES = 6 * 1024;
const css = readFileSync(path.join(__dirname, 'mascot.css'), 'utf8');

function svgsOf(html: string): string[] {
  return html.match(/<svg[\s\S]*?<\/svg>/g) ?? [];
}

describe('Nib poses', () => {
  it('has the twelve poses', () => {
    expect([...NIB_POSES].sort()).toEqual(['haul', 'lantern', 'lost', 'nod', 'oops', 'perch', 'quiet', 'ring', 'spy', 'squint', 'tilt', 'wave']);
  });

  it.each(NIB_POSES)('%s renders, is aria-hidden by default, under 6KB, no SMIL', (pose) => {
    const html = renderToStaticMarkup(<Nib pose={pose} animate />);
    expect(html).toContain('<svg');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('viewBox="0 0 200 240"');
    expect(html).not.toMatch(/<animate|<set /);
    expect(Buffer.byteLength(html)).toBeLessThan(MAX_BYTES);
  });

  it.each(NIB_POSES)('%s exposes an accessible name when given a title', (pose) => {
    render(<Nib pose={pose} title={`Nib, ${pose}`} />);
    expect(screen.getByRole('img', { name: `Nib, ${pose}` })).toBeInTheDocument();
  });

  it('only loops when animate is set', () => {
    expect(renderToStaticMarkup(<Nib pose="perch" />)).not.toContain('data-ambient');
    expect(renderToStaticMarkup(<Nib pose="perch" animate />)).toContain('data-ambient');
  });

  it('NibMini and the icon stay small', () => {
    expect(Buffer.byteLength(renderToStaticMarkup(<NibMini />))).toBeLessThan(MAX_BYTES);
    expect(Buffer.byteLength(nibIconSvg())).toBeLessThan(MAX_BYTES);
    render(<NibMini title="Nib" />);
    expect(screen.getByRole('img', { name: 'Nib' })).toBeInTheDocument();
  });
});

describe('reduced motion', () => {
  it('every animation rule lives inside the no-preference block', () => {
    const start = css.indexOf('@media (prefers-reduced-motion: no-preference)');
    expect(start).toBeGreaterThan(-1);
    // Find the matching close of that media block.
    let depth = 0;
    let end = -1;
    for (let i = css.indexOf('{', start); i < css.length; i++) {
      if (css[i] === '{') depth++;
      if (css[i] === '}' && --depth === 0) {
        end = i;
        break;
      }
    }
    const outside = css.slice(0, start) + css.slice(end + 1);
    const stripped = outside.replace(/@keyframes[^{]+\{(?:[^{}]|\{[^{}]*\})*\}/g, '');
    expect(stripped).not.toMatch(/animation\s*:/);
    expect(stripped).not.toMatch(/transition\s*:/);
  });

  it('keeps the frame fully drawn under reduced motion', () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce\)[\s\S]*stroke-dashoffset: 0/);
  });
});

describe('ComicStrip', () => {
  it('renders five captions as real text, not inside the SVG', () => {
    const { container } = render(<ComicStrip />);
    const items = container.querySelectorAll('li');
    expect(items).toHaveLength(5);
    for (const li of items) {
      const cap = li.querySelector('p.cap');
      expect(cap?.textContent?.length).toBeGreaterThan(5);
      expect(li.querySelector('svg')?.textContent).toBe('');
      expect(li.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    }
    expect(screen.getByText('Hold. Not this one.')).toBeInTheDocument();
  });

  it('has whole-strip alt text mentioning every panel', () => {
    const { container } = render(<ComicStrip />);
    const fig = container.querySelector('figure');
    expect(fig).toHaveAttribute('aria-label', 'The night the quikrequest came aboard');
    const alt = container.querySelector('.nib-sr')?.textContent ?? '';
    for (let i = 1; i <= 5; i++) expect(alt).toContain(`Panel ${i}:`);
    expect(alt).toContain('quikrequest');
  });

  it('accepts caption overrides', () => {
    render(<ComicStrip captions={['a', 'b', 'c', 'd', 'e']} />);
    expect(screen.getByText('e')).toBeInTheDocument();
  });

  it('every panel SVG is under 6KB and the strip has no raster images', () => {
    const html = renderToStaticMarkup(<ComicStrip />);
    const svgs = svgsOf(html);
    expect(svgs).toHaveLength(5);
    for (const s of svgs) expect(Buffer.byteLength(s)).toBeLessThan(MAX_BYTES);
    expect(html).not.toContain('<img');
    expect(Buffer.byteLength(html)).toBeLessThan(24 * 1024 * 2);
  });
});

describe('FirstRunStrip', () => {
  it('renders three captions as text and panels under 6KB', () => {
    const { container } = render(<FirstRunStrip />);
    expect(container.querySelectorAll('li')).toHaveLength(3);
    expect(screen.getByText("The horizon's empty.")).toBeInTheDocument();
    for (const s of svgsOf(renderToStaticMarkup(<FirstRunStrip />))) expect(Buffer.byteLength(s)).toBeLessThan(MAX_BYTES);
  });
});

describe('illustrated states', () => {
  it('each shows one sentence and decorative art', () => {
    const cases = [
      [EmptyNib, /Nothing to show yet/],
      [LoadingNib, /Checking your packages/],
      [ErrorNib, /slipped on our side/],
      [OfflineNib, /lantern's out/],
      [NotFoundNib, /isn't here/],
      [SuccessNib, /Nib's back/],
    ] as const;
    for (const [Comp, re] of cases) {
      const { container, unmount } = render(<Comp />);
      expect(within(container).getByText(re)).toBeInTheDocument();
      expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
      unmount();
    }
  });

  it('error is announced as an alert, loading as status', () => {
    render(<ErrorNib />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    render(<LoadingNib />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
