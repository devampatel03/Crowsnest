'use client';

import { useId, useState } from 'react';
import { cn } from '@/lib/format';
import { Gauge, type GaugeLevel } from './Gauge';

/** A package standing on the line that Crowsnest has called. */
export type HorizonSighting = { name: string; level: GaugeLevel; call: string };
export type HorizonTick = { id: string; sighting?: HorizonSighting };

/**
 * Sample project: 12 ticks, 3 of them sighted. Fictional
 * names, the same three samples as the "Check a name" sandbox. The call text
 * is placeholder text; pass your own lines through the `ticks` prop.
 */
export const SAMPLE_HORIZON: HorizonTick[] = [
  { id: 't0' },
  { id: 't1' },
  { id: 't2', sighting: { name: 'tidy-dates', level: 'clear', call: 'Clear. tidy-dates has no flags.' } },
  { id: 't3' },
  { id: 't4' },
  { id: 't5' },
  {
    id: 't6',
    sighting: {
      name: 'fast-csv-lite',
      level: 'watch',
      call: 'Watch. fast-csv-lite is barely downloaded and has no repository link.',
    },
  },
  { id: 't7' },
  { id: 't8' },
  {
    id: 't9',
    sighting: {
      name: 'quikrequest',
      level: 'hold',
      call: 'Hold. quikrequest is six days old and almost nobody uses it.',
    },
  },
  { id: 't10' },
  { id: 't11' },
];

// Ordinary ticks vary a little in height so the line reads as packages, not a ruler.
const TICK_HEIGHTS = [14, 20, 12, 18, 16, 22, 13, 19, 15, 21, 12, 17];

const STEM_BG: Record<GaugeLevel, string> = {
  clear: 'bg-clear',
  note: 'bg-fg-mute',
  watch: 'bg-watch',
  hold: 'bg-hold',
};

/**
 * The Horizon: one 1px line across a 12px-radius band with package
 * ticks standing on it. Ticks and sighted marks are in the server HTML; the
 * one-time beam sweep and the mark brightening are pure CSS (globals.css:
 * .horizon-sweep, .horizon-mark-sighted) and are absent or already lit under
 * prefers-reduced-motion. Hover, focus or tap on a sighted mark prints its
 * call under the line in a polite live region.
 */
export function HorizonLine({
  ticks = SAMPLE_HORIZON,
  caption = 'Sample project',
  hint = 'Hover, focus or tap a mark to read its call.',
  defaultActiveId,
  className,
}: {
  ticks?: HorizonTick[];
  caption?: string;
  hint?: string;
  /** Mark whose call is shown at rest (before any hover or tap). */
  defaultActiveId?: string;
  className?: string;
}) {
  const liveId = useId();
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(defaultActiveId ?? null);
  const activeId = hover ?? pinned;
  const active = ticks.find((t) => t.id === activeId)?.sighting ?? null;
  const n = ticks.length;

  return (
    <figure className={cn('m-0 flex flex-col gap-s2', className)}>
      <div className="relative overflow-hidden rounded-panel border border-rule bg-surface">
        <div className="px-s4 pb-s4 pt-s5 md:px-s5">
          <ul
            aria-label="Packages in the sample project"
            className="relative m-0 flex h-[4rem] list-none items-end justify-between border-b border-rule-strong p-0"
          >
            {ticks.map((t, i) => {
              const s = t.sighting;
              if (!s) {
                return (
                  <li key={t.id} aria-hidden="true" className="flex items-end">
                    <span
                      className="block w-0.5 bg-fg-mute"
                      style={{ height: TICK_HEIGHTS[i % TICK_HEIGHTS.length] }}
                    />
                  </li>
                );
              }
              return (
                <li key={t.id} className="flex items-end">
                  <button
                    type="button"
                    aria-describedby={liveId}
                    aria-pressed={pinned === t.id}
                    aria-label={`${s.name}, ${s.level === 'clear' ? 'Clear' : s.level === 'watch' ? 'Watch' : s.level === 'hold' ? 'Hold' : 'Note'}`}
                    data-level={s.level}
                    onMouseEnter={() => setHover(t.id)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(t.id)}
                    onBlur={() => setHover(null)}
                    onClick={() => setPinned((p) => (p === t.id ? null : t.id))}
                    style={{ '--p': (i + 0.5) / n } as React.CSSProperties}
                    className="horizon-mark-sighted flex min-h-11 min-w-11 flex-col items-center justify-end gap-s1 px-1"
                  >
                    <span aria-hidden="true" className="mb-1 flex origin-bottom scale-[1.5]">
                      <Gauge level={s.level} showWord={false} />
                    </span>
                    <span aria-hidden="true" className={cn('block h-5 w-0.5', STEM_BG[s.level])} />
                  </button>
                </li>
              );
            })}
          </ul>
          <p
            id={liveId}
            aria-live="polite"
            className="m-0 mt-s4 flex min-h-[3.25rem] items-start gap-s2 text-body text-fg md:min-h-[1.75rem]"
          >
            {active ? (
              <>
                <span aria-hidden="true" className="mt-[0.3125rem] flex">
                  <Gauge level={active.level} showWord={false} animate />
                </span>
                <span>{active.call}</span>
              </>
            ) : (
              <span className="text-body-s text-fg-mute">{hint}</span>
            )}
          </p>
        </div>
        <span aria-hidden="true" className="horizon-sweep" />
      </div>
      <figcaption className="text-body-s text-fg-mute">{caption}</figcaption>
    </figure>
  );
}
