import type { CSSProperties, ElementType, ReactNode } from 'react';
import { cn } from '@/lib/format';
import { sketchRectPath, type TailSide } from './sketch-path';

/**
 * A hand-drawn frame (v3). Server component. The outline is a wobbly closed
 * path generated from `id` (same id, same drawing, on server and client), drawn
 * 1.5px in `--c-line-strong` (`tone="panel"`: 2px `--c-fg-mute`, for comic
 * panels). `vector-effect: non-scaling-stroke` keeps the stroke width constant
 * while the 100x100 path stretches to the box (`preserveAspectRatio="none"`).
 *
 * Use for story objects only: hero band, comic panels, speech bubbles, the
 * sandbox panel, the first-run strip. NOT for Panels, tables, dialogs or code
 * wells. Keep at most 8 sketch frames in any viewport.
 *
 * `draw` plays a one-time draw-on (MotionGate holds below-the-fold frames until
 * 25% visible; reduced motion is fully drawn). `index` staggers by 120ms.
 * The frame itself is decorative (aria-hidden); content goes in children and
 * keeps its own semantics.
 */
export function SketchFrame({
  id,
  tone = 'line',
  tail = 'none',
  draw = true,
  index = 0,
  as,
  className,
  contentClassName,
  children,
  ...rest
}: {
  /** Seed for the jitter. Pick a stable string, e.g. `hero-band`, `panel-3`. */
  id: string;
  tone?: 'line' | 'panel';
  /** Bubble tail on the bottom edge. */
  tail?: TailSide;
  draw?: boolean;
  /** Stagger index for the draw-on delay. */
  index?: number;
  as?: ElementType;
  className?: string;
  contentClassName?: string;
  children?: ReactNode;
} & Omit<React.HTMLAttributes<HTMLElement>, 'id' | 'className' | 'children'>) {
  const Tag = (as ?? 'div') as ElementType;
  const d = sketchRectPath(id, { tail });
  const style = { '--draw-i': index } as CSSProperties;
  return (
    <Tag data-sketch={id} className={cn('relative', className)} {...rest}>
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        data-draw={draw ? 'on' : undefined}
        style={style}
        className="pointer-events-none absolute inset-0 size-full overflow-visible fill-none"
      >
        <path
          d={d}
          pathLength={1}
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn('sketch-path', tone === 'panel' ? 'stroke-fg-mute' : 'stroke-rule-strong')}
          strokeWidth={tone === 'panel' ? 2 : 1.5}
        />
      </svg>
      <div className={cn('relative', contentClassName)}>{children}</div>
    </Tag>
  );
}

/**
 * Nib's speech bubble: a SketchFrame bubble with a tail and hand-face text.
 * `tone` is `nib` only. Text is real text (no art). Keep to 14 words, no
 * exclamation marks, and no jokes beside a Hold.
 */
export function SpeechBubble({
  id,
  tail = 'bottom-left',
  tone = 'nib',
  index,
  className,
  children,
}: {
  id: string;
  tail?: TailSide;
  tone?: 'nib';
  index?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <SketchFrame
      id={id}
      tail={tail}
      index={index}
      data-tone={tone}
      className={cn('rounded-ctl bg-raised', className)}
      contentClassName="nib-voice px-s3 py-s2 text-fg"
    >
      {children}
    </SketchFrame>
  );
}
