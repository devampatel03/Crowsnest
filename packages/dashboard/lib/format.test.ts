import { describe, expect, it } from 'vitest';
import { truncateLeft, truncateMiddle } from './format';
import { computeWindow } from './hooks/useWindowedRows';
import { nextRovingIndex } from './hooks/useRovingFocus';

describe('truncate helpers', () => {
  it('truncateMiddle keeps head and tail and respects max', () => {
    const out = truncateMiddle('abcdefghijklmnop', 9);
    expect(out).toHaveLength(9);
    expect(out).toBe('abcd…mnop');
    expect(out.startsWith('abcd')).toBe(true);
    expect(out.endsWith('mnop')).toBe(true);
    expect(out.split('…')).toHaveLength(2);
    expect(truncateMiddle('short', 9)).toBe('short');
  });
  it('truncateLeft keeps the basename', () => {
    const out = truncateLeft('/home/dev/projects/crowsnest/package-lock.json', 24);
    expect(out.length).toBeLessThanOrEqual(24);
    expect(out.startsWith('…')).toBe(true);
    expect(out.endsWith('package-lock.json')).toBe(true);
  });
});

describe('computeWindow', () => {
  it('windows with overscan and pads the rest', () => {
    const w = computeWindow({ count: 1000, rowHeight: 40, overscan: 8, scrollTop: 4000, viewportHeight: 400 });
    expect(w.start).toBe(92);
    expect(w.end).toBe(100 + 10 + 8);
    expect(w.padTop).toBe(92 * 40);
    expect(w.padBottom).toBe((1000 - 118) * 40);
  });
  it('clamps at both ends', () => {
    const top = computeWindow({ count: 5, rowHeight: 40, overscan: 8, scrollTop: 0, viewportHeight: 640 });
    expect(top).toEqual({ start: 0, end: 5, padTop: 0, padBottom: 0 });
  });
});

describe('nextRovingIndex', () => {
  it('handles j/k, arrows, Home and End, clamped', () => {
    expect(nextRovingIndex('j', 0, 3, 'vertical')).toBe(1);
    expect(nextRovingIndex('k', 0, 3, 'vertical')).toBe(0);
    expect(nextRovingIndex('ArrowDown', 2, 3, 'vertical')).toBe(2);
    expect(nextRovingIndex('End', 0, 3, 'vertical')).toBe(2);
    expect(nextRovingIndex('Home', 2, 3, 'vertical')).toBe(0);
    expect(nextRovingIndex('j', 0, 3, 'horizontal')).toBeNull();
    expect(nextRovingIndex('ArrowRight', 0, 3, 'horizontal')).toBe(1);
  });
});
