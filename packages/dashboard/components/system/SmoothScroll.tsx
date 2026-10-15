'use client';

import { useEffect } from 'react';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

/**
 * Site-wide controlled scrolling, in both directions. Wheel and trackpad input
 * is eased with a low lerp, and three things keep it controlled:
 *
 * - Each wheel event moves the target by at most `MAX_STEP` px, so one hard
 *   flick cannot throw the page.
 * - The target may never run more than `LEAD` of a screen ahead of where the
 *   page is, so a fast spin builds up to a steady glide instead of an
 *   ever-longer launch. Going up is the same as going down.
 * - Only an element that genuinely scrolls vertically (more than a few pixels
 *   of overflow, and not already at the edge in the direction of travel) takes
 *   the wheel from the page. A code block whose content is a pixel taller than
 *   its box no longer switches the smoothing off.
 *
 * Arrow, Page, Space and Home/End keys glide too. Touch is smoothed too (the
 * finger drags the page 1:1, release carries on with eased momentum), and
 * reduced motion gets plain native scrolling on every device (Lenis honours that
 * itself). Renders nothing.
 *
 * In-page `#anchors` glide to the target, clear of the sticky header. A Radix
 * dialog locks the page with `data-scroll-locked` on the body; smoothing pauses
 * while that is present.
 */
const MAX_STEP = 140;
const LEAD = 0.8;
const EDGE = 2;

function scrollsVertically(node: HTMLElement, dir: number): boolean {
  const style = getComputedStyle(node);
  if (!['auto', 'scroll', 'overlay'].includes(style.overflowY)) return false;
  const room = node.scrollHeight - node.clientHeight;
  if (room <= 4) return false;
  if (dir < 0 && node.scrollTop <= EDGE) return false;
  if (dir > 0 && node.scrollTop >= room - EDGE) return false;
  return true;
}

function isEditable(el: EventTarget | null): boolean {
  return el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

export function SmoothScroll() {
  useEffect(() => {
    // The sticky header is 4.75rem tall; rem follows the interface scale.
    const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    let dir = 0;

    const lenis = new Lenis({
      lerp: 0.075,
      wheelMultiplier: 0.85,
      smoothWheel: true,
      // Touch is smoothed too: the finger drags the page 1:1 and the release carries on
      // with eased momentum, the same glide the wheel gets. Without this the browser's
      // own scrolling takes over on phones and tablets.
      syncTouch: true,
      syncTouchLerp: 0.09,
      touchInertiaExponent: 1.6,
      touchMultiplier: 1,
      anchors: { offset: -4.75 * rootPx },
      autoRaf: true,
      prevent: (node) => scrollsVertically(node, dir),
      // Runs before Lenis reads the delta, so changing it here shapes the scroll.
      virtualScroll: (data) => {
        if (data.event.type !== 'wheel') {
          // Touch: keep the direction current so a nested scroller can hand off at its edge.
          if (data.deltaY !== 0) dir = Math.sign(data.deltaY);
          return true;
        }
        let d = Math.max(-MAX_STEP, Math.min(MAX_STEP, data.deltaY));
        dir = Math.sign(d);
        if (d !== 0) {
          const lead = lenis.targetScroll - lenis.animatedScroll;
          const room = Math.max(0, LEAD * window.innerHeight - (Math.sign(lead) === dir ? Math.abs(lead) : 0));
          // Never 0 (a zero delta would hand the event back to the browser).
          d = dir * Math.max(1, Math.min(Math.abs(d), room));
        }
        data.deltaY = d;
        return true;
      },
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || isEditable(e.target)) return;
      if (document.body.hasAttribute('data-scroll-locked')) return;
      const t = e.target;
      if (t instanceof HTMLElement && t !== document.body && (/^(BUTTON|A|SUMMARY)$/.test(t.tagName) && e.key === ' ')) return;
      if (t instanceof HTMLElement && scrollsVertically(t, e.key === 'ArrowUp' || e.key === 'PageUp' ? -1 : 1)) return;
      const page = window.innerHeight * 0.88;
      let to: number | null = null;
      switch (e.key) {
        case 'ArrowDown': to = lenis.targetScroll + 80; break;
        case 'ArrowUp': to = lenis.targetScroll - 80; break;
        case 'PageDown': to = lenis.targetScroll + page; break;
        case 'PageUp': to = lenis.targetScroll - page; break;
        case ' ': to = lenis.targetScroll + (e.shiftKey ? -page : page); break;
        case 'Home': to = 0; break;
        case 'End': to = lenis.limit; break;
      }
      if (to === null) return;
      e.preventDefault();
      lenis.scrollTo(to, { duration: 0.9 });
    };
    window.addEventListener('keydown', onKey);

    const syncLock = () => {
      if (document.body.hasAttribute('data-scroll-locked')) lenis.stop();
      else lenis.start();
    };
    syncLock();
    const observer = new MutationObserver(syncLock);
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-scroll-locked'] });

    return () => {
      window.removeEventListener('keydown', onKey);
      observer.disconnect();
      lenis.destroy();
    };
  }, []);

  return null;
}
