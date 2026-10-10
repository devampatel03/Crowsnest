'use client';

import { useCallback, useRef, useState, type KeyboardEvent, type Ref } from 'react';

type Orientation = 'vertical' | 'horizontal';

/** Pure: next index for a key, or null when the key is not a navigation key. */
export function nextRovingIndex(key: string, index: number, count: number, orientation: Orientation): number | null {
  if (count <= 0) return null;
  const last = count - 1;
  const prev = orientation === 'vertical' ? ['ArrowUp', 'k'] : ['ArrowLeft'];
  const next = orientation === 'vertical' ? ['ArrowDown', 'j'] : ['ArrowRight'];
  if (next.includes(key)) return Math.min(index + 1, last);
  if (prev.includes(key)) return Math.max(index - 1, 0);
  if (key === 'Home') return 0;
  if (key === 'End') return last;
  return null;
}

/**
 * One tab stop for a list: the item at `index` has tabIndex 0, the rest -1.
 * Arrows (and j/k when vertical), Home and End move real focus. Keys that
 * originate in a child control are ignored so single-key shortcuts never fire
 * while typing (WCAG 2.1.4).
 */
export function useRovingFocus(p: { count: number; onMove?: (i: number) => void; orientation?: Orientation }) {
  const { count, onMove, orientation = 'vertical' } = p;
  const [index, setIndexState] = useState(0);
  const items = useRef<(HTMLElement | null)[]>([]);

  const setIndex = useCallback(
    (i: number) => {
      const clamped = Math.max(0, Math.min(i, Math.max(count - 1, 0)));
      setIndexState(clamped);
      onMove?.(clamped);
      items.current[clamped]?.focus();
    },
    [count, onMove],
  );

  const getItemProps = (i: number): { tabIndex: 0 | -1; onKeyDown: (e: KeyboardEvent) => void; ref: Ref<HTMLElement> } => ({
    tabIndex: i === Math.min(index, Math.max(count - 1, 0)) ? 0 : -1,
    onKeyDown: (e) => {
      if (e.target !== e.currentTarget) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const n = nextRovingIndex(e.key, i, count, orientation);
      if (n === null) return;
      e.preventDefault();
      setIndex(n);
    },
    ref: (el) => {
      items.current[i] = el;
    },
  });

  return { index, setIndex, getItemProps };
}
