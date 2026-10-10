'use client';

import './charts.css';
import { memo, useEffect, useMemo, useState } from 'react';
import { Line, LineChart, ReferenceDot, XAxis, YAxis } from 'recharts';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { cn } from '@/lib/format';
import type { HeartbeatProps } from './contracts';
import { chartTheme, ripple } from './theme';
import { BLIP, HEARTBEAT_SECONDS, heartbeatLabel, heartbeatSeries, type HeartbeatPoint } from './transforms';

export const HEARTBEAT_HINT =
  'Each bump is something Crowsnest just did, like starting a scan or finding a package to hold.';

/**
 * The trace itself. Exported so tests can mount with a fixed clock.
 * Real events only: the series is all zeros until a `scan_progress` or
 * `incident_detected` event arrives, and a zero series is a flat line.
 */
export const HeartbeatTrace = memo(function HeartbeatTrace({
  points,
  live,
  width,
  height,
}: {
  points: HeartbeatPoint[];
  live: boolean;
  width: number;
  height: number;
}) {
  const last = points[points.length - 1];
  const base = live ? chartTheme.all : chartTheme.series3;
  return (
    <LineChart width={width} height={height} data={points} margin={{ top: 4, right: 10, bottom: 4, left: 2 }}>
      <XAxis type="number" dataKey="t" scale="time" domain={[points[0].t, last.t]} hide />
      <YAxis type="number" domain={[0, BLIP.incident + 1]} hide />
      <Line
        type="monotone"
        dataKey="v"
        stroke={base}
        strokeWidth={chartTheme.strokeWidth}
        strokeDasharray={live ? undefined : '3 3'}
        dot={false}
        activeDot={false}
        isAnimationActive={false}
      />
      {live ? (
        <Line
          type="monotone"
          dataKey="hold"
          stroke={chartTheme.hold}
          strokeWidth={chartTheme.strokeWidth}
          dot={false}
          activeDot={false}
          connectNulls={false}
          isAnimationActive={false}
        />
      ) : null}
      <ReferenceDot
        x={last.t}
        y={last.v}
        ifOverflow="visible"
        shape={(p: { cx?: number; cy?: number }) =>
          typeof p.cx === 'number' && typeof p.cy === 'number' ? (
            <g data-testid="heartbeat-head" pointerEvents="none">
              {live ? (
                <circle className="cn-ripple" cx={p.cx} cy={p.cy} r={ripple.ringR - 1} fill="none" stroke={base} strokeWidth={1.25} />
              ) : null}
              <circle
                cx={p.cx}
                cy={p.cy}
                r={live ? 2.5 : 3}
                fill={live ? base : 'none'}
                stroke={base}
                strokeWidth={1.5}
              />
            </g>
          ) : (
            <g />
          )
        }
      />
    </LineChart>
  );
});

/**
 * Console header trace: the last 60 seconds of what Crowsnest actually did.
 * Flat when quiet (no ambient wiggle, ever), a small bump for each scan phase,
 * a large one for each incident (Hold colour when HIGH or CRITICAL). Offline is
 * a dashed muted line with a hollow head.
 *
 * One update per second only while the tab is visible and motion is allowed;
 * under reduced motion the clock steps every 10 seconds (events still appear,
 * on the next step). A parent may re-render on every SSE event: the series is
 * memoised on the events array and the whole-second clock.
 */
export const Heartbeat = memo(function Heartbeat({
  events,
  live = true,
  now,
  width = 160,
  height = 28,
  className,
}: HeartbeatProps) {
  const reduced = useReducedMotion();
  const [clock, setClock] = useState(() => now ?? Date.now());
  useEffect(() => {
    if (now !== undefined) return;
    const step = reduced ? 10_000 : 1000;
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      setClock(Date.now());
    };
    tick();
    const id = setInterval(tick, step);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [now, reduced]);
  const at = now ?? clock;
  const second = Math.floor(at / 1000);

  const points = useMemo(() => heartbeatSeries(events, second * 1000 + 999, HEARTBEAT_SECONDS), [events, second]);
  const label = useMemo(() => heartbeatLabel(events, second * 1000 + 999, HEARTBEAT_SECONDS), [events, second]);

  return (
    <div
      role="img"
      aria-label={live ? label : `Offline. ${label}`}
      title={HEARTBEAT_HINT}
      className={cn('inline-block shrink-0', className)}
      style={{ width, height }}
      data-testid="heartbeat"
    >
      <div aria-hidden="true">
        <HeartbeatTrace points={points} live={live} width={width} height={height} />
      </div>
    </div>
  );
});
