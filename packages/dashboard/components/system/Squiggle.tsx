import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/format';
import { squigglePath, squiggleVariantFor } from './sketch-path';

/**
 * Pencil underline for the last word of each landing H2 and docs H1:
 * `<h2>How it protects <Squiggle id="how">you.</Squiggle></h2>`. 6px tall,
 * `--c-brand`, three variants (pass `variant`, or it is derived from `id`).
 * Draws on once (500ms); reduced motion is fully drawn. The line is
 * decorative (`aria-hidden`); the word keeps its normal reading. Not for
 * H2/H3 inside prose.
 */
export function Squiggle({
  id,
  variant,
  draw = true,
  className,
  children,
}: {
  id: string;
  variant?: 1 | 2 | 3;
  draw?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const v = variant ?? squiggleVariantFor(id);
  return (
    <span className={cn('relative inline-block whitespace-nowrap', className)} data-squiggle={v}>
      {children}
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox="0 0 120 8"
        preserveAspectRatio="none"
        data-draw={draw ? 'on' : undefined}
        style={{ '--draw-ms': '500ms' } as CSSProperties}
        className="pointer-events-none absolute -bottom-1 left-0 h-[0.375rem] w-full overflow-visible fill-none"
      >
        <path
          d={squigglePath(v)}
          pathLength={1}
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          className="sketch-path stroke-brand"
        />
      </svg>
    </span>
  );
}
