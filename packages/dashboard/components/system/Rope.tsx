'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { cn } from '@/lib/format';
import { prefersReducedMotion } from './MotionGate';
import { smoothPath } from './sketch-path';

/**
 * The mast rope: a braided rope hung from a hook at the top, drawn in SVG and
 * kept in gentle motion. Three things move it: a slow pendulum swing, a wave
 * that travels down its length, and a lean against your scroll speed that
 * settles when you stop. Everything is decorative (`aria-hidden`).
 *
 * Things that sit on the rope ride its curve: mark them `data-follow` inside
 * the element passed as `followIn` (knots, section labels), and the rope also
 * carries the `[data-rope-marker]` Nib at the position in `--rope-p` on
 * `progressIn`. Followers read the offset from `--sway-x`.
 *
 * The rope is centred on the left edge of its positioned parent and is wider
 * than its body, so the swing has room. Under reduced motion it is drawn once
 * as a calm curve and nothing animates.
 */
export function Rope({
  className,
  followIn,
  progressIn,
}: {
  className?: string;
  followIn?: RefObject<HTMLElement | null>;
  progressIn?: RefObject<HTMLElement | null>;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const outline = useRef<SVGPathElement>(null);
  const body = useRef<SVGPathElement>(null);
  const twist = useRef<SVGPathElement>(null);
  const hook = useRef<SVGCircleElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !outline.current || !body.current || !twist.current || !hook.current) return;
    const reduce = prefersReducedMotion();
    const paths = [outline.current, body.current, twist.current];
    let W = 0;
    let H = 0;
    let s = 1;
    let items: { el: HTMLElement; y: number }[] = [];
    let marker: HTMLElement | null = null;
    let raf = 0;
    let kick = 0;
    let idleFrames = 0;
    let lastScroll = window.scrollY;
    const t0 = performance.now();

    const measure = () => {
      const r = svg.getBoundingClientRect();
      W = r.width;
      H = r.height;
      s = (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16) / 16;
      outline.current!.setAttribute('stroke-width', String(5 * s));
      body.current!.setAttribute('stroke-width', String(2.6 * s));
      twist.current!.setAttribute('stroke-width', String(2.6 * s));
      twist.current!.setAttribute('stroke-dasharray', `${1.1 * s} ${3.1 * s}`);
      hook.current!.setAttribute('r', String(2.8 * s));
      items = [];
      const scope = followIn?.current;
      if (scope) {
        scope.querySelectorAll<HTMLElement>('[data-follow]').forEach((el) => {
          const b = el.getBoundingClientRect();
          items.push({ el, y: b.top + b.height / 2 - r.top });
        });
        marker = scope.querySelector<HTMLElement>('[data-rope-marker]');
      }
    };

    // Horizontal offset of the rope's centre line at depth y, relative to its rest line.
    const offsetAt = (y: number, t: number) => {
      const k = H > 0 ? Math.min(1, Math.max(0, y / H)) : 0;
      const swing = Math.sin(t * 1.05) * 6.5 * s * Math.pow(k, 1.1) + Math.sin(t * 0.63 + 1.3) * 2.4 * s * k;
      const wave = Math.sin(y / (40 * s) - t * 2.3) * 3.4 * s * Math.min(1, y / (60 * s));
      return swing + wave + kick * Math.pow(k, 1.3);
    };

    const draw = (t: number) => {
      if (H <= 0) return;
      const step = 9 * s;
      const pts: [number, number][] = [];
      for (let y = 0; y < H; y += step) pts.push([W / 2 + offsetAt(y, t), y]);
      pts.push([W / 2 + offsetAt(H, t), H]);
      const d = smoothPath(pts);
      for (const p of paths) p.setAttribute('d', d);
      hook.current!.setAttribute('cx', String(W / 2));
      hook.current!.setAttribute('cy', String(3 * s));
      for (const it of items) it.el.style.setProperty('--sway-x', `${offsetAt(it.y, t).toFixed(2)}px`);
      if (marker) {
        const p = parseFloat(progressIn?.current?.style.getPropertyValue('--rope-p') || '0') || 0;
        marker.style.setProperty('--sway-x', `${offsetAt(p * H + 8 * s, t).toFixed(2)}px`);
      }
    };

    let inFrame = false;
    const frame = (now: number) => {
      if (inFrame) return; // a synchronous requestAnimationFrame must not recurse
      inFrame = true;
      const y = window.scrollY;
      const v = y - lastScroll;
      lastScroll = y;
      const target = Math.max(-14 * s, Math.min(14 * s, -v * 0.5));
      kick += (target - kick) * 0.09;
      if (marker) {
        const dir = Math.abs(v) > 0.4 ? (v > 0 ? 'down' : 'up') : null;
        if (dir) {
          idleFrames = 0;
          if (marker.dataset.climb !== dir) marker.dataset.climb = dir;
        } else if (++idleFrames > 10 && marker.dataset.climb) {
          delete marker.dataset.climb;
        }
      }
      draw((now - t0) / 1000);
      raf = requestAnimationFrame(frame);
      inFrame = false;
    };

    measure();
    const timers = [window.setTimeout(measure, 300), window.setTimeout(measure, 1200)];
    const ro =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            measure();
            if (reduce) draw(0.7);
          });
    ro?.observe(svg);
    window.addEventListener('resize', measure, { passive: true });

    if (reduce) draw(0.7);
    else raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [followIn, progressIn]);

  return (
    <svg
      ref={svgRef}
      aria-hidden="true"
      focusable="false"
      data-rope="vertical"
      className={cn('absolute left-0 top-0 h-full w-[2.5rem] -translate-x-1/2 overflow-visible fill-none', className)}
    >
      <path ref={outline} stroke="var(--c-nib-line)" strokeLinecap="round" strokeLinejoin="round" />
      <path ref={body} stroke="var(--c-rope)" strokeLinecap="butt" />
      <path ref={twist} stroke="var(--c-rope-dark)" strokeOpacity="0.8" strokeLinecap="butt" />
      <circle ref={hook} r="2.8" fill="var(--c-surface)" stroke="var(--c-nib-line)" strokeWidth="1.5" />
    </svg>
  );
}

/** A rope knot: a small filled circle (major) or a smaller one (minor). `active` is the brand knot. */
export function Knot({
  size = 'major',
  active,
  follow,
  className,
}: {
  size?: 'major' | 'minor';
  active?: boolean;
  /** Rides the swaying rope (set on knots that are not inside a followed link). */
  follow?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      data-knot={size}
      data-follow={follow ? '' : undefined}
      className={cn(
        'block rounded-knot border border-nib-line transition-colors duration-ui ease-lookout',
        size === 'major' ? 'size-[0.625rem]' : 'size-1 border-0 opacity-70',
        active ? 'scale-125 bg-cta' : 'bg-rope-dark',
        className,
      )}
    />
  );
}
