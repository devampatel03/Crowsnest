import type { CSSProperties } from 'react';
import { cn } from '@/lib/format';
import { wavePath } from './sketch-path';

/**
 * Section divider: a hand-drawn wave, 1px `--c-line-strong`, about 24px
 * amplitude, seeded by `id` so server and client match. Replaces the straight
 * divider between landing sections and above the footer. Draws left to right
 * once (700ms) when 25% visible; reduced motion is fully drawn. Purely
 * decorative: `aria-hidden`, no semantics (use a real heading to start the
 * next section).
 */
export function WaveRule({ id, draw = true, className }: { id: string; draw?: boolean; className?: string }) {
  return (
    <div aria-hidden="true" data-wave={id} className={cn('h-12 w-full', className)}>
      <svg
        viewBox="0 0 1200 48"
        preserveAspectRatio="none"
        focusable="false"
        data-draw={draw ? 'on' : undefined}
        style={{ '--draw-ms': '700ms' } as CSSProperties}
        className="size-full overflow-visible fill-none"
      >
        <path
          d={wavePath(id)}
          pathLength={1}
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeWidth={1}
          className="sketch-path stroke-rule-strong"
        />
      </svg>
    </div>
  );
}
