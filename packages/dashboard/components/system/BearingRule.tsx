'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { cn } from '@/lib/format';
import { prefersReducedMotion } from './MotionGate';
import { Knot, Rope } from './Rope';

/** `bearing` is always derived from the section count; any value passed in is ignored. */
export type BearingSection = { id: string; title: string; label?: string; bearing?: string };
export type LiveStatus = 'connecting' | 'live' | 'scanning' | 'reconnecting' | 'offline';

/**
 * Derived bearing label: sections are spaced evenly around the full circle,
 * `index * 360 / count`, rounded, zero-padded to 3 digits. 5 sections read
 * `000° 072° 144° 216° 288°`; 6 read `000° 060° 120° 180° 240° 300°`.
 */
export function bearingFor(index: number, count: number): string {
  if (count < 1) return '000°';
  const deg = Math.round((((index * 360) / count) % 360 + 360) % 360) % 360;
  return `${String(deg).padStart(3, '0')}°`;
}

/** Adds derived bearings to a list of `{ id, title }` sections. */
export function withBearings<T extends { id: string; title: string }>(
  sections: T[],
): (T & { bearing: string })[] {
  return sections.map((s, i) => ({ ...s, bearing: bearingFor(i, sections.length) }));
}

/** Reads sections from elements that declare data-bearing (and an id). */
function readDomSections(): BearingSection[] {
  if (typeof document === 'undefined') return [];
  const els = Array.from(document.querySelectorAll<HTMLElement>('[data-bearing][id]'));
  return els.map((el) => ({
    id: el.id,
    title: el.dataset.bearingTitle ?? el.getAttribute('aria-label') ?? el.id,
  }));
}

/** Pure: which minor-tick counts to show per section (paragraph blocks, capped at 5). */
export function minorTickCount(paragraphs: number): number {
  return Math.max(0, Math.min(5, paragraphs));
}

/**
 * Where the rope marker sits, 0..1 along the rope. Knots are spaced evenly
 * (knot i at i/n), so the marker interpolates between the knot of the section
 * the line `y` is inside and the next knot. `tops` are the sections' page-top
 * offsets (ascending), `end` the bottom of the last section. Pure.
 */
export function ropeProgress(tops: number[], y: number, end: number): number {
  const n = tops.length;
  if (n === 0 || y <= tops[0]) return 0;
  let i = 0;
  for (let k = 0; k < n; k++) if (y >= tops[k]) i = k;
  const stop = i + 1 < n ? tops[i + 1] : Math.max(end, tops[i] + 1);
  const frac = Math.min(1, Math.max(0, (y - tops[i]) / Math.max(1, stop - tops[i])));
  return Math.min(1, (i + frac) / n);
}

function useActiveSection(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(null);
  const key = ids.join('|');
  useEffect(() => {
    if (!key || typeof IntersectionObserver === 'undefined') return;
    const els = key
      .split('|')
      .map((id) => document.getElementById(id))
      .filter((e): e is HTMLElement => !!e);
    if (!els.length) return;
    // Band near the top of the viewport: the section crossing it is "current".
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: '-20% 0px -70% 0px', threshold: 0 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [key]);
  return active ?? ids[0] ?? null;
}

/**
 * Scroll-linked rope progress. One passive scroll handler, rAF-throttled,
 * writes `--rope-p` on the wrapper (no re-render) and reports the section
 * index the reading line is in when it changes.
 */
function useRopeScroll(
  ids: string[],
  wrapRef: RefObject<HTMLElement | null>,
  onIndex: (index: number, id: string) => void,
) {
  const key = ids.join('|');
  const cb = useRef(onIndex);
  useEffect(() => {
    cb.current = onIndex;
  });
  useEffect(() => {
    if (!key) return;
    const list = key.split('|');
    let frame = 0;
    let last = -1;
    const run = () => {
      frame = 0;
      const els = list.map((id) => document.getElementById(id));
      if (els.some((e) => !e)) return;
      const y = window.scrollY + window.innerHeight * 0.2;
      const tops = els.map((e) => e!.getBoundingClientRect().top + window.scrollY);
      const end = els[els.length - 1]!.getBoundingClientRect().bottom + window.scrollY;
      wrapRef.current?.style.setProperty('--rope-p', ropeProgress(tops, y, end).toFixed(4));
      let idx = 0;
      tops.forEach((t, k) => {
        if (y >= t) idx = k;
      });
      if (idx !== last) {
        last = idx;
        cb.current(idx, list[idx]);
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(run);
    };
    run();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [key, wrapRef]);
}

/**
 * The Bearing Rule, v3 (brief section 4 "Rope Rule"). `site`: a vertical mast
 * rope (twisted SVG pattern) with a 6px knot per section, 3px minor knots per
 * paragraph block (max 5), the ACTIVE knot in the beam colour with the
 * section title beside it only, and bearing degrees on the rule only (derived
 * `i*360/n`, in the sr-only link name and the tooltip). A `marker` (pass the
 * illustrator's rope crow, e.g. a NibMini) rides the rope with scroll through
 * the `--rope-p` CSS variable (400ms ease; snaps under reduced motion). When
 * the reader reaches `ringAt` (e.g. `install`) from another section, the
 * marker wrapper gets `data-ring="true"` for 600ms (CSS rotates it; crow art
 * may also key off the attribute) and `onRing` fires once per page view;
 * neither happens under reduced motion. Labels are links, so the rule is also
 * the table of contents. Below 768px it is a 2px segmented bar with the
 * marker riding it.
 *
 * `console`: the short live indicator, unchanged: a 6px tip, solid beam when
 * live or scanning, hollow otherwise (aria-hidden; the same state is printed
 * once as text in the header). Pass `lantern` to render Nib's lantern in the
 * tip's place (lit or unlit is the artwork's job; `data-live-status` stays on
 * the wrapper).
 */
export function BearingRule({
  variant,
  sections,
  live,
  marker,
  markerCompact,
  showLabels = true,
  ringAt,
  onRing,
  lantern,
  className,
}: {
  variant: 'site' | 'console';
  sections?: BearingSection[];
  live?: { status: LiveStatus; text: string };
  /** Rope crow slot (site). Decorative; defaults to a small hollow ring. */
  marker?: ReactNode;
  /** Smaller stand-in for the thin progress bar under 768px. Defaults to `marker`. */
  markerCompact?: ReactNode;
  /** Print the active section beside its knot. Off where a table of contents already names the sections. */
  showLabels?: boolean;
  /** Section id at which the marker rings once (e.g. `install`). */
  ringAt?: string;
  onRing?: (id: string) => void;
  /** Console: replaces the square tip (Nib with the lantern). */
  lantern?: ReactNode;
  className?: string;
}) {
  const [domSections, setDomSections] = useState<BearingSection[]>([]);
  const [minor, setMinor] = useState<Record<string, number>>({});
  const [ringing, setRinging] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const ringed = useRef(false);
  const prevId = useRef<string | null>(null);

  const provided = sections && sections.length > 0 ? sections : null;
  const list = withBearings(provided ?? domSections);
  const ids = list.map((s) => s.id);
  const idKey = ids.join('|');
  const active = useActiveSection(ids);

  useRopeScroll(variant === 'site' ? ids : [], wrapRef, (_index, id) => {
    const from = prevId.current;
    prevId.current = id;
    if (!ringAt || id !== ringAt || from === null || from === ringAt) return;
    if (ringed.current || prefersReducedMotion()) return;
    ringed.current = true;
    setRinging(true);
    onRing?.(id);
    window.setTimeout(() => setRinging(false), 600);
  });

  useEffect(() => {
    // Only runs on the client after mount: discovers sections declared in the
    // DOM when none were passed, and counts paragraph blocks for minor ticks.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!provided) setDomSections(readDomSections());
  }, [provided]);

  useEffect(() => {
    const counts: Record<string, number> = {};
    for (const id of idKey ? idKey.split('|') : []) {
      counts[id] = minorTickCount(document.getElementById(id)?.querySelectorAll('p').length ?? 0);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMinor(counts);
  }, [idKey]);

  if (variant === 'console') {
    const status = live?.status ?? 'connecting';
    const solid = status === 'live' || status === 'scanning';
    return (
      <div aria-hidden="true" className={cn('relative hidden w-3 shrink-0 md:block', className)}>
        <div className="absolute inset-y-0 left-[2px] w-px bg-rule-strong" />
        {lantern ? (
          <span data-live-status={status} className="absolute left-0 top-0 block">
            {lantern}
          </span>
        ) : (
          <span
            data-live-status={status}
            className={cn(
              'absolute left-0 top-0 block size-1.5 rounded-none border border-brand',
              solid ? 'bg-brand' : 'bg-transparent',
            )}
          />
        )}
        {list.map((s, i) => (
          <span
            key={s.id}
            className="absolute left-[2px] block h-px w-3 bg-rule-strong"
            style={{ top: `${((i + 1) / (list.length + 1)) * 100}%` }}
          />
        ))}
      </div>
    );
  }

  const activeIndex = Math.max(0, ids.indexOf(active ?? ''));
  const markerNode = marker ?? <span className="block size-2.5 rounded-knot border border-brand bg-canvas" />;

  return (
    <div ref={wrapRef} className="contents" style={{ '--rope-p': 0 } as CSSProperties}>
      <nav
        ref={navRef}
        aria-label="Page sections"
        style={{ opacity: 'clamp(0, calc((1 - var(--rope-p, 0)) * 18), 1)' } as CSSProperties}
        className={cn('sticky top-[5.75rem] z-10 hidden h-[min(60vh,32.5rem)] w-44 shrink-0 md:block', className)}
      >
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-0">
          <Rope followIn={navRef} progressIn={wrapRef} />
        </div>
        <ol className="relative m-0 flex h-full list-none flex-col justify-between p-0">
          {list.map((s, i) => {
            const isActive = s.id === active;
            return (
              <li key={s.id} className="relative flex flex-1 flex-col justify-start">
                <a
                  href={`#${s.id}`}
                  data-follow
                  aria-current={isActive ? 'location' : undefined}
                  title={`${s.title} (${s.bearing})`}
                  className="group relative flex min-h-4 items-center no-underline"
                >
                  <Knot active={isActive} className="absolute -left-[0.3125rem]" />
                  {isActive && showLabels ? (
                    <span aria-hidden="true" className="ml-5 min-w-0 font-sans text-label leading-tight text-fg">
                      {s.label ?? s.title}
                    </span>
                  ) : null}
                  <span className="sr-only">
                    {s.title}, {s.bearing}
                  </span>
                </a>
                <span aria-hidden="true" className="mt-1 flex flex-1 flex-col justify-evenly">
                  {Array.from({ length: i === list.length - 1 ? 0 : (minor[s.id] ?? 0) }, (_, k) => (
                    <Knot key={k} size="minor" follow className="-ml-0.5" />
                  ))}
                </span>
              </li>
            );
          })}
        </ol>
        <div
          aria-hidden="true"
          data-rope-marker
          data-ring={ringing ? 'true' : undefined}
          className="rope-marker pointer-events-none"
        >
          {markerNode}
        </div>
      </nav>
      {list.length > 0 ? (
        <div
          role="progressbar"
          aria-label="Reading progress"
          aria-valuemin={0}
          aria-valuemax={list.length}
          aria-valuenow={activeIndex + 1}
          className="fixed inset-x-0 top-header z-30 flex h-0.5 gap-px bg-canvas md:hidden"
        >
          {list.map((s, i) => (
            <span key={s.id} className={cn('block flex-1', i <= activeIndex ? 'bg-brand' : 'bg-rule-strong')} />
          ))}
          <div
            aria-hidden="true"
            data-rope-marker-h
            data-ring={ringing ? 'true' : undefined}
            className="rope-marker-h pointer-events-none size-4"
          >
            {markerCompact ?? marker ?? null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
