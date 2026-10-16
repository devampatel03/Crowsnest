import type { CSSProperties } from 'react';
import { cn } from '@/lib/format';

const CLOUD_A = 'M0 20C6 8 22 6 30 14C36 4 56 6 58 18C70 16 78 22 72 28H8C2 28 -2 24 0 20Z';
const CLOUD_B = 'M0 14C8 6 20 6 26 12C34 6 48 8 50 16C56 16 60 20 56 24H6C0 24 -3 18 0 14Z';
const WISP = 'M0 8C14 2 30 12 46 6C58 2 70 8 82 5';
const STROKE = 'fill-none stroke-rule-strong';
const BASE = { strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', vectorEffect: 'non-scaling-stroke' } as const;

function LayerA() {
  return (
    <svg viewBox="0 0 1200 120" preserveAspectRatio="xMidYMid meet" focusable="false">
      <circle cx="930" cy="40" r="28" className={STROKE} {...BASE} />
      <path transform="translate(120 52)" d={CLOUD_A} className={STROKE} {...BASE} />
      <path transform="translate(520 30)" d={WISP} className={STROKE} {...BASE} />
    </svg>
  );
}

function LayerB() {
  return (
    <svg viewBox="0 0 1200 120" preserveAspectRatio="xMidYMid meet" focusable="false">
      <path transform="translate(300 70)" d={CLOUD_B} className={STROKE} {...BASE} />
      <path transform="translate(760 62)" d={WISP} className={STROKE} {...BASE} />
    </svg>
  );
}

/**
 * Sketch sky: the drifting backdrop behind hero text only. One moon ring
 * and four cloud wisps in `--c-line-strong` strokes, in two layers drifting
 * left at 140s and 220s (seamless: each layer is two identical copies at 2x
 * width). Height is capped at 18% of the hero and faded out by an alpha mask;
 * no stars, noise or particles. Place inside a `relative` hero; it is
 * `aria-hidden` and `pointer-events-none`. It is an ambient loop: MotionGate
 * pauses it offscreen and while the tab is hidden; reduced motion renders the
 * first frame static.
 */
export function SketchSky({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" data-ambient data-sky className={cn('sky', className)}>
      <div className="sky-layer" style={{ '--sky-ms': '140s' } as CSSProperties}>
        <LayerA />
        <LayerA />
      </div>
      <div className="sky-layer" style={{ '--sky-ms': '220s' } as CSSProperties}>
        <LayerB />
        <LayerB />
      </div>
    </div>
  );
}
