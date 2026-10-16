'use client';

import { useEffect } from 'react';

/** True when the user asked for reduced motion. Safe where matchMedia is missing. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Tiny, render-nothing client gate for the motion rules. Mounted once in
 * the root layout.
 *
 * 1. Tab hidden: sets `data-motion="off"` on <html>; CSS pauses every
 *    `[data-ambient]` animation (globals.css).
 * 2. One IntersectionObserver toggles `data-inview="true|false"` on each
 *    `[data-ambient]` block, so offscreen loops pause.
 * 3. Draw-on once: `[data-draw]` blocks that start below the fold are held
 *    `pending` and flipped to `run` when 25% visible. Under reduced motion
 *    nothing is held, so everything is drawn.
 */
export function MotionGate() {
  useEffect(() => {
    const root = document.documentElement;
    const onVisibility = () => {
      if (document.hidden) root.setAttribute('data-motion', 'off');
      else root.removeAttribute('data-motion');
    };
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);

    if (typeof IntersectionObserver === 'undefined') {
      return () => document.removeEventListener('visibilitychange', onVisibility);
    }

    const reduced = prefersReducedMotion();
    const ambient = new IntersectionObserver((entries) => {
      for (const e of entries) e.target.setAttribute('data-inview', e.isIntersecting ? 'true' : 'false');
    });
    const draw = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          if (e.target.getAttribute('data-draw') === 'pending') e.target.setAttribute('data-draw', 'run');
          draw.unobserve(e.target);
        }
      },
      { threshold: 0.25 },
    );

    document.querySelectorAll('[data-ambient]').forEach((el) => ambient.observe(el));
    document.querySelectorAll('[data-draw]').forEach((el) => {
      if (reduced) return;
      const r = el.getBoundingClientRect();
      if (r.top >= window.innerHeight) el.setAttribute('data-draw', 'pending');
      draw.observe(el);
    });

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      ambient.disconnect();
      draw.disconnect();
    };
  }, []);

  return null;
}
