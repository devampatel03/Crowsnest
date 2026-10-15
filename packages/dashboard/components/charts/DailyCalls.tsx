'use client';

import './charts.css';
import { memo, useEffect, useId, useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { cn } from '@/lib/format';
import { SkeletonRows } from '@/components/system/Skeleton';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { ChartFigure } from './ChartFigure';
import { ChartErrorBlock } from './ChartStates';
import { TooltipPanel } from './ChartTooltip';
import type { DailyCallsProps } from './contracts';
import { chartTheme, ripple, safeId, tickStyle } from './theme';
import {
  callsWord,
  dailyBuckets,
  dailyDomain,
  dailyEmptyText,
  dailyTicks,
  dailyYMax,
  dayIso,
  dayTitle,
  headLabelOffsets,
  latestCall,
  tickLabelAt,
  waveGridTicks,
  waveSummary,
  waveTableRows,
  windowPhrase,
  type DayBucket,
} from './transforms';

/** Room on the right for the end labels ("All 12", "Hold 12"). */
const LABEL_ROOM = 60;
const AXIS_ROOM = 24;

function DayTooltip({ active, payload, utc }: { active?: boolean; payload?: { payload?: DayBucket }[]; utc: boolean }) {
  const b = active ? payload?.[0]?.payload : undefined;
  if (!b) return null;
  return (
    <TooltipPanel
      title={`${dayTitle(b, utc)} · ${callsWord(b.total)}`}
      subtitle={dayIso(b, utc)}
      rows={[
        { label: 'All calls', value: b.total, swatch: chartTheme.all },
        { label: 'On Hold', value: b.hold, swatch: chartTheme.hold },
      ]}
    />
  );
}

/** The live head: a solid dot, a ripple ring (static when offline or reduced motion) and the direct label. */
function Head({
  cx,
  cy,
  color,
  label,
  dy,
  live,
}: {
  cx?: number;
  cy?: number;
  color: string;
  label: string;
  dy: number;
  live: boolean;
}) {
  if (typeof cx !== 'number' || typeof cy !== 'number') return <g />;
  return (
    <g data-testid="wave-head" pointerEvents="none">
      {live ? (
        <circle className="cn-ripple" cx={cx} cy={cy} r={ripple.ringR} fill="none" stroke={color} strokeWidth={1.5} />
      ) : (
        <circle className="cn-ring-static" cx={cx} cy={cy} r={ripple.ringR + 1} fill="none" stroke={color} strokeWidth={1.5} />
      )}
      <circle cx={cx} cy={cy} r={ripple.dotR} fill={live ? color : chartTheme.surface} stroke={color} strokeWidth={1.5} />
      {label ? (
        <text x={cx + 12} y={cy + dy} style={{ ...tickStyle, fill: color, fontWeight: 500 }}>
          {label}
        </text>
      ) : null}
    </g>
  );
}

/**
 * The wave. Exported so tests can mount with a fixed width and height.
 *
 * One shared numeric time scale: `t` is the middle of each day, the XAxis is
 * `type="number"` with an explicit domain (first midnight to the last day's end),
 * and both series (All calls, On Hold) use the same x. `type="monotone"` never
 * overshoots between two real days. Zero-filled days are real zeros.
 */
export const DailyWave = memo(function DailyWave({
  buckets,
  utc = false,
  live = true,
  variant = 'wave',
  width,
  height,
}: {
  buckets: DayBucket[];
  utc?: boolean;
  live?: boolean;
  variant?: 'wave' | 'spark';
  width?: number;
  height?: number;
}) {
  const uid = safeId(useId());
  const spark = variant === 'spark';
  const domain = useMemo(() => dailyDomain(buckets), [buckets]);
  const ticks = useMemo(() => dailyTicks(buckets), [buckets]);
  const tickValues = useMemo(() => ticks.map((k) => k.t), [ticks]);
  const yMax = useMemo(() => dailyYMax(buckets), [buckets]);
  const gridTicks = useMemo(() => waveGridTicks(yMax), [yMax]);
  const last = buckets[buckets.length - 1];
  const plotH = Math.max(1, (height ?? 200) - (spark ? 0 : AXIS_ROOM + chartTheme.margin.top));
  const off = headLabelOffsets(last.total, last.hold, yMax, plotH);
  const gradAll = `cn-all-${uid}`;
  const gradHold = `cn-hold-${uid}`;
  const margin = spark ? { top: 4, right: 6, bottom: 2, left: 6 } : { ...chartTheme.margin, right: LABEL_ROOM };

  return (
    <AreaChart width={width} height={height} data={buckets} margin={margin}>
      <defs>
        {[
          [gradAll, chartTheme.all],
          [gradHold, chartTheme.hold],
        ].map(([id, color]) => (
          <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} className="cn-stop-top" />
            <stop offset="100%" stopColor={color} className="cn-stop-bottom" />
          </linearGradient>
        ))}
      </defs>
      {spark ? null : (
        <CartesianGrid vertical={false} horizontalValues={gridTicks} stroke={chartTheme.grid} strokeWidth={1} />
      )}
      <XAxis
        type="number"
        dataKey="t"
        scale="time"
        domain={domain}
        ticks={tickValues}
        allowDataOverflow
        tickFormatter={(v: number) => tickLabelAt(ticks, v)}
        tickLine={false}
        axisLine={spark ? false : { stroke: chartTheme.axisLine, strokeWidth: 1 }}
        tick={tickStyle}
        tickMargin={6}
        interval={0}
        hide={spark}
      />
      <YAxis type="number" domain={[0, yMax]} ticks={gridTicks} hide />
      <Tooltip
        content={<DayTooltip utc={utc} />}
        cursor={{ stroke: chartTheme.axisLine, strokeWidth: 1 }}
        isAnimationActive={false}
      />
      <Area
        type="monotone"
        dataKey="total"
        name="All calls"
        stroke={chartTheme.all}
        strokeWidth={chartTheme.stroke}
        fill={`url(#${gradAll})`}
        dot={false}
        activeDot={{ r: 3.5, stroke: chartTheme.surface, strokeWidth: 1.5, fill: chartTheme.all }}
        isAnimationActive={false}
      />
      {spark ? null : (
        <Area
          type="monotone"
          dataKey="hold"
          name="On Hold"
          stroke={chartTheme.hold}
          strokeWidth={chartTheme.stroke}
          fill={`url(#${gradHold})`}
          dot={false}
          activeDot={{ r: 3.5, stroke: chartTheme.surface, strokeWidth: 1.5, fill: chartTheme.hold }}
          isAnimationActive={false}
        />
      )}
      <ReferenceDot
        x={last.t}
        y={last.total}
        ifOverflow="visible"
        shape={(p: { cx?: number; cy?: number }) => (
          <Head cx={p.cx} cy={p.cy} color={chartTheme.all} label={spark ? '' : `All ${last.total}`} dy={off.all} live={live} />
        )}
      />
      {spark ? null : (
        <ReferenceDot
          x={last.t}
          y={last.hold}
          ifOverflow="visible"
          shape={(p: { cx?: number; cy?: number }) => (
            <Head cx={p.cx} cy={p.cy} color={chartTheme.hold} label={`Hold ${last.hold}`} dy={off.hold} live={live} />
          )}
        />
      )}
    </AreaChart>
  );
});

/**
 * Horizon, "Last 30 days": a smooth wave of calls per day. Two series, not stacked:
 * All calls (beam) and On Hold (hold colour, always at or below All). Soft area
 * fills, direct labels at the live head, no legend. With no calls it falls back
 * to the plain sentence (honest: no fake wave), and `emptyAdornment` is a slot for
 * the console's cameo.
 */
export function DailyCalls({
  incidents,
  days = 30,
  now,
  utc = false,
  height,
  variant = 'wave',
  live = true,
  emptyAdornment,
  loading,
  error,
  onRetry,
  emptyText,
  className,
}: DailyCallsProps) {
  const spark = variant === 'spark';
  const plotHeight = height ?? (spark ? 48 : 200);
  // Roll the window over at midnight without a render storm: one check every 5 minutes.
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    if (now !== undefined) return;
    const id = setInterval(() => setTick(Date.now()), 5 * 60_000);
    return () => clearInterval(id);
  }, [now]);
  const clock = now ?? tick;
  const reduced = useReducedMotion();

  const buckets = useMemo(() => dailyBuckets(incidents, days, clock, utc), [incidents, days, clock, utc]);
  const total = useMemo(() => buckets.reduce((a, b) => a + b.total, 0), [buckets]);
  const latest = useMemo(() => latestCall(incidents), [incidents]);
  const summary = useMemo(() => waveSummary(buckets, days, latest, utc), [buckets, days, latest, utc]);
  const rows = useMemo(() => waveTableRows(buckets, utc), [buckets, utc]);

  if (error) return <ChartErrorBlock error={error} onRetry={onRetry} />;
  if (loading) {
    return (
      <div style={{ minHeight: plotHeight }}>
        <SkeletonRows rows={Math.max(2, Math.floor(plotHeight / 48))} rowHeight={48} label="Loading calls per day." />
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className={cn('flex flex-wrap items-end justify-between gap-s4', className)} data-testid="daily-empty">
        <p className="m-0 text-body-s text-fg-soft">{emptyText ?? dailyEmptyText(days, latest, utc)}</p>
        {emptyAdornment ? <div className="shrink-0">{emptyAdornment}</div> : null}
      </div>
    );
  }
  return (
    <ChartFigure
      className={className}
      ariaLabel={`Calls per day over ${windowPhrase(days)}.`}
      summary={summary}
      toggle={!spark}
      table={{
        caption: `Calls per day over ${windowPhrase(days)}, newest day first`,
        headers: ['Day', 'All calls', 'On Hold'],
        rows,
      }}
    >
      <div
        aria-hidden="true"
        style={{ height: plotHeight, minHeight: plotHeight }}
        className={cn('w-full', !reduced && !spark && 'cn-swell')}
      >
        <ResponsiveContainer width="100%" height="100%" minHeight={plotHeight}>
          <DailyWave buckets={buckets} utc={utc} live={live && !reduced} variant={variant} />
        </ResponsiveContainer>
      </div>
    </ChartFigure>
  );
}
