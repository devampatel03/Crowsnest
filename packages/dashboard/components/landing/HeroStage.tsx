'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import './hero.css';

/**
 * The hero's only client code, kept deliberately small. The page below is
 * server-rendered (marks, Nib, bubble, call line); this island listens for
 * three things and writes text and attributes into that markup.
 *
 *  - Marks: hover, focus or tap shows the call and Nib's reaction.
 *  - Nib's bell: a fixed cycle of lines, no randomness; a Hold is never on
 *    screen at the same time as a tip.
 *  - Cursor: on a fine pointer with motion allowed, `--look-x/--look-y`
 *    turn Nib's head and spyglass toward the pointer (rAF throttled).
 */
export function HeroStage({ rest, bellLines, children }: { rest: string; bellLines: readonly string[]; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const q = <T extends HTMLElement>(s: string) => root.querySelector<T>(s);
    const btn = q<HTMLButtonElement>('[data-nib-btn]');
    const bubbleText = q('[data-bubble-text]');
    const bubbleWrap = q('[data-bubble-wrap]');
    const callText = q('[data-call-text]');
    const marks = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-mark]'));
    const gauges = Array.from(root.querySelectorAll<HTMLElement>('[data-call-gauge]'));
    if (!btn || !bubbleText || !bubbleWrap || !callText) return;

    let pinned: string | null = null;
    let hover: string | null = null;
    let bell = -1;
    let ringTimer = 0;

    const render = () => {
      const id = hover ?? pinned;
      const m = id ? marks.find((x) => x.dataset.mark === id) : undefined;
      let line = '';
      if (m) {
        callText.textContent = m.dataset.call ?? '';
        line = m.dataset.bubble ?? '';
      } else {
        callText.textContent = '';
        line = bell >= 0 ? bellLines[bell] : rest;
      }
      for (const g of gauges) g.hidden = !m || g.dataset.callGauge !== m.dataset.level;
      bubbleText.textContent = line;
      bubbleWrap.setAttribute('data-empty', line ? 'false' : 'true');
      for (const x of marks) x.setAttribute('aria-pressed', String(pinned === x.dataset.mark));
    };

    const markOf = (t: EventTarget | null) => (t as HTMLElement | null)?.closest?.<HTMLButtonElement>('[data-mark]') ?? null;
    const onOver = (e: Event) => {
      const m = markOf(e.target);
      if (m) {
        hover = m.dataset.mark ?? null;
        render();
      }
    };
    const onOut = (e: Event) => {
      if (markOf(e.target)) {
        hover = null;
        render();
      }
    };
    const onClick = (e: Event) => {
      const m = markOf(e.target);
      if (!m) return;
      pinned = pinned === m.dataset.mark ? null : (m.dataset.mark ?? null);
      render();
    };
    const onBell = () => {
      pinned = null;
      hover = null;
      bell = (bell + 1) % bellLines.length;
      btn.setAttribute('data-ringing', '');
      window.clearTimeout(ringTimer);
      ringTimer = window.setTimeout(() => btn.removeAttribute('data-ringing'), 1300);
      render();
    };

    root.addEventListener('mouseover', onOver);
    root.addEventListener('focusin', onOver);
    root.addEventListener('mouseout', onOut);
    root.addEventListener('focusout', onOut);
    root.addEventListener('click', onClick);
    btn.addEventListener('click', onBell);

    let raf = 0;
    let move: ((e: PointerEvent) => void) | null = null;
    const hero = root.closest<HTMLElement>('[data-hero]');
    const motionOk = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (hero && motionOk && window.matchMedia('(pointer: fine)').matches) {
      const clamp = (n: number) => Math.max(-1, Math.min(1, n));
      move = (e) => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          const r = btn.getBoundingClientRect();
          btn.style.setProperty('--look-x', clamp((e.clientX - (r.left + r.width * 0.6)) / 500).toFixed(2));
          btn.style.setProperty('--look-y', clamp((e.clientY - (r.top + r.height * 0.3)) / 320).toFixed(2));
        });
      };
      hero.addEventListener('pointermove', move);
    }

    return () => {
      root.removeEventListener('mouseover', onOver);
      root.removeEventListener('focusin', onOver);
      root.removeEventListener('mouseout', onOut);
      root.removeEventListener('focusout', onOut);
      root.removeEventListener('click', onClick);
      btn.removeEventListener('click', onBell);
      if (hero && move) hero.removeEventListener('pointermove', move);
      cancelAnimationFrame(raf);
      window.clearTimeout(ringTimer);
    };
  }, [rest, bellLines]);

  return (
    <div ref={ref} className="contents">
      {children}
    </div>
  );
}
