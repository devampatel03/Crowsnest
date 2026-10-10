import type { CSSProperties, ReactNode } from 'react';
import { rng, smoothPath } from '@/components/system/sketch-path';
import { cn } from '@/lib/format';

type Pt = [number, number];

/**
 * A hand-drawn frame for wide boxes (the hero band and the sandbox). The
 * system SketchFrame is drawn in a square 100x100 box, so its rounded corners
 * stretch into blobs on a 900px-wide panel. This one is drawn in a nominal
 * `w` x `h` box close to the real aspect, with tight corners and a small
 * seeded wobble along each edge. Same stroke rules as SketchFrame (1.5px,
 * non-scaling, draws on once); same seed, same drawing on server and client.
 */
function wideRectPath(seed: string, w: number, h: number): string {
  const rand = rng(seed);
  const j = 2.2;
  const n = () => (rand() - 0.5) * 2 * j;
  const m = 3; // inset
  const c = 9; // distance of the corner-hugging points from the corner
  const pts: Pt[] = [];
  const along = (len: number) => {
    const out: number[] = [];
    const count = Math.max(2, Math.round(len / 180));
    for (let i = 1; i < count; i++) out.push((len * i) / count);
    return out;
  };
  // top, left to right
  pts.push([m + c, m + n()]);
  for (const x of along(w)) pts.push([x, m + n()]);
  pts.push([w - m - c, m + n()], [w - m + n(), m + c]);
  // right, top to bottom
  for (const y of along(h)) pts.push([w - m + n(), y]);
  pts.push([w - m + n(), h - m - c], [w - m - c, h - m + n()]);
  // bottom, right to left
  for (const x of along(w).reverse()) pts.push([x, h - m + n()]);
  pts.push([m + c, h - m + n()], [m + n(), h - m - c]);
  // left, bottom to top
  for (const y of along(h).reverse()) pts.push([m + n(), y]);
  pts.push([m + n(), m + c]);
  return smoothPath(pts, true);
}

export function WideFrame({
  id,
  w,
  h,
  index = 0,
  className,
  contentClassName,
  children,
}: {
  id: string;
  /** Nominal drawing box, near the real aspect ratio of the panel. */
  w: number;
  h: number;
  index?: number;
  className?: string;
  contentClassName?: string;
  children?: ReactNode;
}) {
  return (
    <div data-sketch={id} className={cn('relative', className)}>
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        data-draw="on"
        style={{ '--draw-i': index } as CSSProperties}
        className="pointer-events-none absolute inset-0 size-full overflow-visible fill-none"
      >
        <path
          d={wideRectPath(id, w, h)}
          pathLength={1}
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          className="sketch-path stroke-rule-strong"
        />
      </svg>
      <div className={cn('relative', contentClassName)}>{children}</div>
    </div>
  );
}
