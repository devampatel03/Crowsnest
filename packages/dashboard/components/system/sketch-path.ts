// Pure, seeded path helpers for SketchFrame, WaveRule and Squiggle. The same
// seed always yields the same path, so server and client markup match (no
// hydration drift). Numbers are rounded to 2 decimals to keep output stable.

/** FNV-1a 32-bit hash of a string. */
export function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 PRNG; returns a function giving floats in [0, 1). */
export function rng(seed: string): () => number {
  let a = hashSeed(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;
type Pt = [number, number];

/** Smooth path through points using midpoint quadratic segments. */
export function smoothPath(pts: Pt[], closed = false): string {
  if (pts.length < 2) return '';
  const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const f = (p: Pt) => `${r2(p[0])} ${r2(p[1])}`;
  if (closed) {
    let d = `M${f(mid(pts[pts.length - 1], pts[0]))}`;
    for (let i = 0; i < pts.length; i++) {
      const next = pts[(i + 1) % pts.length];
      d += ` Q${f(pts[i])} ${f(mid(pts[i], next))}`;
    }
    return d + 'Z';
  }
  let d = `M${f(pts[0])}`;
  for (let i = 1; i < pts.length - 1; i++) d += ` Q${f(pts[i])} ${f(mid(pts[i], pts[i + 1]))}`;
  return d + ` L${f(pts[pts.length - 1])}`;
}

export type TailSide = 'bottom-left' | 'bottom-right' | 'none';

/**
 * A wobbly rectangle in a 0..100 x 0..100 box (stretch it with
 * preserveAspectRatio="none"). Points sit along each edge, nudged by up to
 * `jitter` units. An optional tail is a small notch on the bottom edge.
 */
export function sketchRectPath(seed: string, opts: { jitter?: number; tail?: TailSide } = {}): string {
  const rand = rng(seed);
  const j = opts.jitter ?? 1.1;
  const n = () => (rand() - 0.5) * 2 * j;
  const inset = 1.5;
  const lo = inset;
  const hi = 100 - inset;
  const pts: Pt[] = [];
  // top edge, left to right
  for (const t of [0, 0.33, 0.66, 1]) pts.push([lo + (hi - lo) * t + n(), lo + n()]);
  // right edge, top to bottom
  for (const t of [0.5, 1]) pts.push([hi + n(), lo + (hi - lo) * t + n()]);
  // bottom edge, right to left (with the tail notch)
  const tail = opts.tail ?? 'none';
  if (tail === 'bottom-right') {
    pts.push([hi - 10 + n(), hi + n()], [hi - 16, 100], [hi - 22 + n(), hi + n()]);
  }
  for (const t of [0.66, 0.33]) pts.push([lo + (hi - lo) * t + n(), hi + n()]);
  if (tail === 'bottom-left') {
    pts.splice(pts.length, 0, [lo + 22 + n(), hi + n()], [lo + 16, 100], [lo + 10 + n(), hi + n()]);
  }
  pts.push([lo + n(), hi + n()]);
  // left edge, bottom to top
  pts.push([lo + n(), lo + (hi - lo) * 0.5 + n()]);
  return smoothPath(pts, true);
}

/** A hand-drawn wave across a 0..1200 x 0..48 box; amplitude ~24 units peak to peak. */
export function wavePath(seed: string, width = 1200, height = 48): string {
  const rand = rng(seed);
  const step = 100;
  const pts: Pt[] = [];
  const mid = height / 2;
  for (let x = 0, i = 0; x <= width; x += step, i++) {
    const swing = (i % 2 === 0 ? -1 : 1) * (height * 0.3 + rand() * height * 0.15);
    pts.push([x, mid + swing * (0.85 + rand() * 0.3) * 0.5]);
  }
  return smoothPath(pts);
}

/** A pencil underline in a 0..120 x 0..8 box. Variant 1..3 changes the stroke character. */
export function squigglePath(variant: 1 | 2 | 3): string {
  const sets: Record<1 | 2 | 3, Pt[]> = {
    1: [[2, 5], [20, 2.5], [38, 5.5], [58, 2.5], [78, 5.5], [98, 3], [118, 5]],
    2: [[2, 3.5], [16, 5.5], [34, 2.5], [60, 5], [84, 2.8], [104, 5.4], [118, 3.4]],
    3: [[2, 5.5], [28, 3], [46, 5], [72, 3.2], [92, 5.6], [118, 2.8]],
  };
  return smoothPath(sets[variant]);
}

/** Stable variant (1..3) for a section id. */
export function squiggleVariantFor(id: string): 1 | 2 | 3 {
  return ((hashSeed(id) % 3) + 1) as 1 | 2 | 3;
}
