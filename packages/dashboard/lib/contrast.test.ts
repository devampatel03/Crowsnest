import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Resolves the token CSS in app/globals.css and checks WCAG 2.x contrast for the
// one fixed paper theme: every text token against every surface and band shade it
// can sit on (>= 4.5:1), plus the non-text pairs (control borders, focus ring, >= 3:1).
const read = (rel: string) => readFileSync(path.resolve(__dirname, rel), 'utf8');
const css = read('../app/globals.css');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(selector + ' {');
  if (start < 0) throw new Error(`selector not found: ${selector}`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('\n}', start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
const tokens = block(':root');

function resolve(name: string): string {
  let v = tokens[name];
  for (let i = 0; i < 6 && v && v.startsWith('var('); i++) v = tokens[v.slice(4, -1).trim()];
  return v;
}
function lum(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => {
    const s = x / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function ratio(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// There is no `--c-fg-faint`: --c-fg-mute is the lowest text step.
const TEXT = ['--c-fg', '--c-fg-soft', '--c-fg-mute', '--c-brand', '--c-hold', '--c-watch', '--c-clear'];
const SURFACES = ['--c-canvas', '--c-surface', '--c-raised', '--c-pressed'];
const BANDS = ['--band-canvas', '--band-sand', '--band-honey', '--band-clay'];
const HEX = /^#[0-9a-f]{6}$/i;

describe('text tokens reach 4.5:1 on every surface and band shade', () => {
  for (const t of TEXT) {
    for (const b of [...SURFACES, ...BANDS]) {
      it(`${t} on ${b}`, () => {
        const fg = resolve(t);
        const bg = resolve(b);
        expect(fg, t).toMatch(HEX);
        expect(bg, b).toMatch(HEX);
        expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});

describe('button and input pairs', () => {
  it('brand label (--c-on-brand) on --c-brand and --c-brand-hi reaches 4.5:1', () => {
    const on = resolve('--c-on-brand');
    expect(ratio(on, resolve('--c-brand'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(on, resolve('--c-brand-hi'))).toBeGreaterThanOrEqual(4.5);
  });

  it('text on the input fill reaches 4.5:1 (fg, fg-mute placeholder)', () => {
    const bg = resolve('--c-input');
    expect(ratio(resolve('--c-fg'), bg)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(resolve('--c-fg-mute'), bg)).toBeGreaterThanOrEqual(4.5);
  });

  for (const b of ['--c-canvas', '--c-surface', '--c-raised', '--c-input', ...BANDS]) {
    it(`control border --c-field reaches 3:1 on ${b}`, () => {
      expect(ratio(resolve('--c-field'), resolve(b))).toBeGreaterThanOrEqual(3);
    });
  }

  for (const b of ['--c-canvas', '--c-surface', ...BANDS]) {
    it(`focus ring --c-brand reaches 3:1 on ${b}`, () => {
      expect(ratio(resolve('--c-brand'), resolve(b))).toBeGreaterThanOrEqual(3);
    });
  }

  it('the sketch button outline (--c-nib-line) reaches 3:1 on every band shade', () => {
    for (const b of BANDS) expect(ratio(resolve('--c-nib-line'), resolve(b)), b).toBeGreaterThanOrEqual(3);
  });

  it('the primary label (--c-on-cta) reaches 4.5:1 on every yellow it sits on', () => {
    const on = resolve('--c-on-cta');
    for (const c of ['--c-cta', '--c-cta-hi', '--c-cta-lo']) expect(ratio(on, resolve(c)), c).toBeGreaterThanOrEqual(4.5);
  });
});

describe('Nib tokens', () => {
  it('the ink outline reads on the yellow body (>= 4.5:1)', () => {
    expect(ratio(resolve('--c-nib-line'), resolve('--c-nib-fill'))).toBeGreaterThanOrEqual(4.5);
  });

  it('the shape carries: the ink outline is >= 3:1 against every surface and band', () => {
    for (const b of [...SURFACES, ...BANDS]) expect(ratio(resolve('--c-nib-line'), resolve(b)), b).toBeGreaterThanOrEqual(3);
  });

  for (const t of ['--c-fg', '--c-fg-soft']) {
    for (const b of ['--c-canvas', '--c-surface', '--c-raised']) {
      it(`hand-face text ${t} on ${b} reaches 4.5:1 (bubbles, notes, captions)`, () => {
        expect(ratio(resolve(t), resolve(b))).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it('bubble text (--c-fg on --c-raised) reaches 10:1', () => {
    expect(ratio(resolve('--c-fg'), resolve('--c-raised'))).toBeGreaterThanOrEqual(10);
  });
});

describe('token contract', () => {
  it('has one fixed theme: no dark surface, no theme switch', () => {
    for (const dead of ['--abyss', '--deck', '--fog', 'data-theme', "[data-surface='deep']", "[data-surface='fog']", '--flare', '--c-fg-faint']) {
      expect(css.includes(dead), dead).toBe(false);
    }
    expect(css).toContain('color-scheme: light;');
    expect(css).not.toContain('color-scheme: dark;');
  });

  it('defines the Nib body and ink', () => {
    expect(tokens['--nib-fill']).toBe('#f2c53d');
    expect(tokens['--nib-ink']).toBe('#1a1608');
    expect(resolve('--c-nib-line')).toBe('#1a1608');
    expect(resolve('--c-nib-fill')).toBe('#f2c53d');
  });

  it('defines four segment shades, each a distinct cream', () => {
    const shades = BANDS.map(resolve);
    expect(new Set(shades).size).toBe(4);
    for (const s of shades) expect(s).toMatch(HEX);
  });

  it('defines the motion and stroke tokens', () => {
    expect(tokens['--ease-spring']).toBe('cubic-bezier(0.34, 1.56, 0.64, 1)');
    expect(tokens['--area-top']).toBe('0.26');
    expect(tokens['--area-bottom']).toBe('0.02');
    expect(tokens['--stroke-chart']).toBe('2.25px');
    expect(tokens['--stroke-line']).toBe('1.5px');
  });

  it('keeps shadows and blur out of the system CSS and the control CSS', () => {
    for (const file of [css, read('../app/buttons.css')]) {
      expect(file).not.toMatch(/drop-shadow|backdrop-filter|filter:\s*blur/);
    }
    expect(css).not.toMatch(/box-shadow/);
  });

  it('keeps the only gradient in the system CSS the sky alpha mask', () => {
    const lines = css.split('\n').filter((l) => /gradient\(/.test(l));
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(l).toMatch(/mask-image: linear-gradient\(/);
  });

  it('scales the interface through the root font size, in four steps', () => {
    for (const pct of ['106.25%', '112.5%', '118.75%', '125%']) expect(css).toContain(`font-size: ${pct};`);
  });
});
