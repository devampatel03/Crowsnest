import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NibClimber } from './index';

const read = (rel: string) => readFileSync(path.join(__dirname, rel), 'utf8');
const css = read('mascot.css');
const globals = read('../../app/globals.css');
const rule = read('../system/BearingRule.tsx');
const rope = read('../system/Rope.tsx');

/** The text of the first `prefers-reduced-motion: no-preference` block. */
function motionBlock(source: string): string {
  const start = source.indexOf('@media (prefers-reduced-motion: no-preference)');
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i);
  }
  return '';
}

describe('NibClimber', () => {
  it('is decorative art with two wings, two feet and the body to animate', () => {
    const { container } = render(<NibClimber />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('focusable', 'false');
    expect(svg).toHaveAttribute('data-pose', 'climb');
    expect(svg.querySelectorAll('.nib-climb-arm')).toHaveLength(2);
    expect(svg.querySelectorAll('.nib-climb-foot')).toHaveLength(2);
    expect(svg.querySelector('.nib-climb-body')).not.toBeNull();
  });

  it('is sized in rem so it scales with the interface', () => {
    const { container } = render(<NibClimber size={40} />);
    const style = (container.querySelector('svg') as SVGElement).getAttribute('style') ?? '';
    expect(style).toContain('--nib-w: 2.5rem');
    expect(style).toContain('--nib-h: 4.5rem');
  });

  it('climbs only while scrolling, and only without a reduced-motion preference', () => {
    const motion = motionBlock(css);
    for (const part of ['nib-climb-arm-a', 'nib-climb-arm-b', 'nib-climb-foot-a', 'nib-climb-foot-b', 'nib-climb-body']) {
      expect(motion, part).toContain(`[data-climb] .nib-climber .${part} { animation:`);
    }
    expect(motion).toContain("[data-climb='up'] .nib-climber");
    expect(motion).toContain('animation-direction: reverse');
  });
});

describe('rope on the landing page', () => {
  it('sits above the full-width segment bands', () => {
    expect(rule).toContain('sticky top-[5.75rem] z-10');
  });

  it('is thin: a hairline body, not a thick cable', () => {
    const body = /body\.current!\.setAttribute\('stroke-width', String\(([\d.]+) \* s\)\)/.exec(rope);
    const outline = /outline\.current!\.setAttribute\('stroke-width', String\(([\d.]+) \* s\)\)/.exec(rope);
    expect(Number(body![1])).toBeLessThanOrEqual(3);
    expect(Number(outline![1])).toBeLessThanOrEqual(5.5);
  });

  it('keeps the climber on the rope at both ends, anchored by its own height', () => {
    expect(globals).toContain('top: calc(var(--rope-p, 0) * 100%);');
    expect(globals).toContain('calc(var(--rope-p, 0) * -100%)');
  });

  it('fades out near the end of the page, so it never hangs half-hidden under the header', () => {
    expect(rule).toContain('clamp(0, calc((1 - var(--rope-p, 0)) * 18), 1)');
  });

  it('keeps the mobile progress bar fixed under the header, with the marker hanging below it', () => {
    expect(rule).toContain('fixed inset-x-0 top-header z-30');
    expect(globals).toMatch(/.rope-marker-h {[^}]*top: 0.25rem;/);
  });

  it('marks the climb direction from scroll speed, and clears it when idle', () => {
    expect(rope).toContain("v > 0 ? 'down' : 'up'");
    expect(rope).toContain('delete marker.dataset.climb');
  });
});
