'use client';

import { useCallback, useEffect, useState, type RefObject } from 'react';

export type RowWindow = { start: number; end: number; padTop: number; padBottom: number };

/** Pure window maths, exported for tests. `end` is exclusive. */
export function computeWindow(p: {
  count: number;
  rowHeight: number;
  overscan: number;
  scrollTop: number;
  viewportHeight: number;
}): RowWindow {
  const { count, rowHeight, overscan, scrollTop, viewportHeight } = p;
  const first = Math.floor(Math.max(scrollTop, 0) / rowHeight);
  const visible = Math.ceil(viewportHeight / rowHeight);
  const start = Math.max(0, Math.min(first - overscan, count));
  const end = Math.min(count, first + visible + overscan);
  return { start, end, padTop: start * rowHeight, padBottom: Math.max(0, count - end) * rowHeight };
}

/** Fixed-height row windowing over a scroll container. Overscan defaults to 8. */
export function useWindowedRows(p: {
  count: number;
  rowHeight: number;
  overscan?: number;
  scrollRef: RefObject<HTMLElement | null>;
}): RowWindow & { scrollToIndex: (i: number) => void } {
  const { count, rowHeight, overscan = 8, scrollRef } = p;
  // Initial viewport guess so server and first client render show rows.
  const [view, setView] = useState({ scrollTop: 0, height: 640 });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const read = () => setView({ scrollTop: el.scrollTop, height: el.clientHeight || 640 });
    read();
    el.addEventListener('scroll', read, { passive: true });
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', read);
      ro.disconnect();
    };
  }, [scrollRef]);

  const scrollToIndex = useCallback(
    (i: number) => {
      const el = scrollRef.current;
      if (!el) return;
      const top = i * rowHeight;
      const bottom = top + rowHeight;
      // Leave room for the sticky header (one row high).
      if (top - rowHeight < el.scrollTop) el.scrollTop = Math.max(0, top - rowHeight);
      else if (bottom > el.scrollTop + el.clientHeight) el.scrollTop = bottom - el.clientHeight;
    },
    [scrollRef, rowHeight],
  );

  const w = computeWindow({ count, rowHeight, overscan, scrollTop: view.scrollTop, viewportHeight: view.height });
  return { ...w, scrollToIndex };
}
