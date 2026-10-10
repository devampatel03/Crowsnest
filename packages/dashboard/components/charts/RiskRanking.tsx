'use client';

import { memo, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import './charts.css';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Gauge } from '@/components/system/Gauge';
import { EmptyBlock } from '@/components/system/Blocks';
import { SkeletonRows } from '@/components/system/Skeleton';
import { cn, truncateMiddle } from '@/lib/format';
import { ChartFigure } from './ChartFigure';
import { ChartErrorBlock } from './ChartStates';
import { TooltipPanel } from './ChartTooltip';
import type { RiskRankingProps } from './contracts';
import { chartTheme, tickStyle } from './theme';
import { formatRisk, formatRisk2, knotRadius, knotX, rankMaintainers, rankingSummary, type RankedMaintainer } from './transforms';
import { useMountAnimation } from './useMountAnimation';

/** Height of one ranking row: the listbox rows and the bar band share it, so they line up. */
export const RANK_ROW = 32;
const LOGIN_MAX = 20;
export const FLAGGED_TEXT = 'Flagged: linked to known harmful activity';

function RankTooltip({ active, payload }: { active?: boolean; payload?: { payload?: RankedMaintainer }[] }) {
  const m = active ? payload?.[0]?.payload : undefined;
  if (!m) return null;
  return (
    <TooltipPanel
      title={m.login}
      subtitle={m.flagged ? FLAGGED_TEXT : undefined}
      rows={[
        { label: 'Risk', value: formatRisk2(m.risk), tag: 'of 1' },
        { label: 'Your packages', value: m.packages },
        { label: 'Commits, last 90 days', value: m.commits90 },
      ]}
    />
  );
}

interface RopeShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  background?: { x?: number; y?: number; width?: number; height?: number };
  payload?: RankedMaintainer;
  selectedLogin?: string | null;
  animate: boolean;
}

/**
 * One rope: a thin hairline track for the whole 0..1 span, a heavier rope from
 * 0 to the knot, and a knot whose size and position both follow the risk. The
 * flagged colour is the Hold colour; selection adds a ring in the foreground.
 * The value (two decimals, the one rounding) is printed right of the knot.
 */
export function RopeShape({ x = 0, y = 0, width = 0, height = 0, background, payload, selectedLogin, animate }: RopeShapeProps) {
  if (!payload) return <g />;
  const track = background?.width ?? Math.max(width, 1);
  const x0 = background?.x ?? x;
  const cy = y + height / 2;
  const kx = x0 + knotX(payload.risk, track);
  const r = knotRadius(payload.risk);
  const color = payload.flagged ? chartTheme.hold : chartTheme.brand;
  const dim = selectedLogin && selectedLogin !== payload.login;
  const selected = selectedLogin === payload.login;
  return (
    <g opacity={dim ? 0.5 : 1} data-testid="rope" data-risk={formatRisk(payload.risk)}>
      <line x1={x0} x2={x0 + track} y1={cy} y2={cy} stroke={chartTheme.axisLine} strokeWidth={1} />
      <line x1={x0} x2={kx} y1={cy} y2={cy} stroke={color} strokeWidth={chartTheme.stroke} strokeLinecap="round" strokeDasharray="7 1.5" />
      {selected ? <circle cx={kx} cy={cy} r={r + 4} fill="none" stroke={chartTheme.series1} strokeWidth={1.5} /> : null}
      <circle
        className={animate ? 'cn-knot-in' : undefined}
        cx={kx}
        cy={cy}
        r={r}
        fill={color}
        stroke={chartTheme.surface}
        strokeWidth={2}
      />
      <text x={kx + r + 8} y={cy + 4} style={{ ...tickStyle, fill: chartTheme.series1 }}>
        {formatRisk(payload.risk)}
      </text>
    </g>
  );
}

/** The ropes. Exported so tests can mount with a fixed width and height. Plain numeric scale 0..1, no time axis. */
export const RankingBars = memo(function RankingBars({
  data,
  selectedLogin,
  onSelect,
  animate,
  width,
  height,
}: {
  data: RankedMaintainer[];
  selectedLogin?: string | null;
  onSelect?: (login: string | null) => void;
  animate: boolean;
  width?: number;
  height?: number;
}) {
  return (
    <BarChart
      layout="vertical"
      width={width}
      height={height}
      data={data}
      margin={{ top: 0, right: 44, bottom: 0, left: 0 }}
      barCategoryGap={0}
    >
      <XAxis type="number" hide domain={[0, 1]} />
      <YAxis type="category" dataKey="login" hide />
      <Tooltip content={<RankTooltip />} cursor={{ fill: chartTheme.cursor }} isAnimationActive={false} />
      <Bar
        dataKey="risk"
        barSize={RANK_ROW}
        background={{ fill: 'transparent' }}
        isAnimationActive={false}
        shape={(p: unknown) => <RopeShape {...(p as RopeShapeProps)} selectedLogin={selectedLogin} animate={animate} />}
        onClick={(d: { login?: string }) => {
          if (d.login) onSelect?.(d.login === selectedLogin ? null : d.login);
        }}
        style={{ cursor: onSelect ? 'pointer' : undefined }}
      />
    </BarChart>
  );
});

/**
 * Lookout, "People who publish your packages": maintainers ranked by risk, 0 low
 * to 1 high. The names are a real listbox (roving tabindex, aria-selected, arrows,
 * Home/End, Enter or Space selects, Escape clears) aligned row for row with the
 * Recharts bars, so it is keyboard and screen-reader operable. A flagged person
 * carries a Hold gauge and the word Flagged, and a bar in the Hold colour.
 * `View as table` swaps the plot for the full table.
 */
export function RiskRanking({
  maintainers,
  selectedLogin = null,
  onSelect,
  limit = 10,
  cap = 100,
  loading,
  error,
  onRetry,
  emptyText,
  className,
}: RiskRankingProps) {
  const [expanded, setExpanded] = useState(false);
  const ranked = useMemo(() => rankMaintainers(maintainers), [maintainers]);
  const shown = useMemo(() => (expanded ? ranked : ranked.slice(0, limit)), [ranked, expanded, limit]);
  const summary = useMemo(() => rankingSummary(ranked, shown.length), [ranked, shown.length]);
  const anyFlagged = useMemo(() => shown.some((m) => m.flagged), [shown]);
  const animate = useMountAnimation();
  const optionRefs = useRef<(HTMLLIElement | null)[]>([]);
  const selectedIndex = shown.findIndex((m) => m.login === selectedLogin);
  const [focusIdx, setFocusIdx] = useState<number | null>(null);
  const tabIdx = focusIdx !== null && focusIdx < shown.length ? focusIdx : Math.max(0, selectedIndex);

  if (error) return <ChartErrorBlock error={error} onRetry={onRetry} />;
  if (loading) return <SkeletonRows rows={Math.min(limit, 6)} rowHeight={RANK_ROW} label="Loading the people who publish your packages." />;
  if (ranked.length === 0) {
    return (
      <EmptyBlock
        sentence={emptyText ?? 'No publishers to show yet. Scan a project to see who maintains your packages.'}
      />
    );
  }

  const move = (i: number) => {
    const next = Math.max(0, Math.min(shown.length - 1, i));
    setFocusIdx(next);
    optionRefs.current[next]?.focus();
  };
  const onKey = (e: KeyboardEvent<HTMLLIElement>, i: number) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        move(i + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        move(i - 1);
        break;
      case 'Home':
        e.preventDefault();
        move(0);
        break;
      case 'End':
        e.preventDefault();
        move(shown.length - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        onSelect?.(shown[i].login === selectedLogin ? null : shown[i].login);
        break;
      case 'Escape':
        if (selectedLogin) {
          e.preventDefault();
          onSelect?.(null);
        }
        break;
    }
  };

  const plotHeight = shown.length * RANK_ROW;
  return (
    <ChartFigure
      className={className}
      ariaLabel="People who publish your packages, highest risk first."
      summary={summary}
      table={{
        caption: 'People who publish your packages, highest risk first',
        headers: ['Person', 'Risk (0 low to 1 high)', 'Flagged', 'Your packages', 'Commits, last 90 days'],
        rows: shown.map((m) => [m.login, formatRisk2(m.risk), m.flagged ? 'Flagged' : 'No', m.packages, m.commits90]),
      }}
    >
      <p className="label m-0">Risk, 0 low to 1 high</p>
      <div className={cn('flex min-w-0', expanded && 'max-h-[27.5rem] overflow-y-auto')}>
        <ul
          role="listbox"
          aria-label="People who publish your packages, highest risk first"
          className="m-0 w-[13.125rem] shrink-0 list-none p-0"
        >
          {shown.map((m, i) => {
            const selected = m.login === selectedLogin;
            return (
              <li
                key={m.login}
                ref={(el) => {
                  optionRefs.current[i] = el;
                }}
                role="option"
                aria-selected={selected}
                aria-label={`${m.login}, risk ${formatRisk2(m.risk)} of 1${m.flagged ? `. ${FLAGGED_TEXT}` : ''}`}
                tabIndex={i === tabIdx ? 0 : -1}
                onKeyDown={(e) => onKey(e, i)}
                onFocus={() => setFocusIdx(i)}
                onClick={() => onSelect?.(selected ? null : m.login)}
                style={{ height: RANK_ROW }}
                className={cn(
                  'flex cursor-pointer items-center gap-s2 truncate rounded-ctl border-l-2 px-s2 font-mono text-[0.75rem]',
                  selected ? 'border-brand bg-pressed text-fg' : 'border-transparent text-fg-soft hover:bg-raised',
                )}
              >
                <span className="truncate">{truncateMiddle(m.login, LOGIN_MAX)}</span>
                {m.flagged ? (
                  <span className="ml-auto flex shrink-0 items-center gap-s1 font-sans text-[0.75rem] text-hold">
                    <Gauge level="hold" showWord={false} />
                    Flagged
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
        <div aria-hidden="true" className="min-w-0 flex-1" style={{ height: plotHeight, minHeight: RANK_ROW * 3 }}>
          <ResponsiveContainer width="100%" height="100%" minHeight={RANK_ROW * 3}>
            <RankingBars data={shown} selectedLogin={selectedLogin} onSelect={onSelect} animate={animate} />
          </ResponsiveContainer>
        </div>
      </div>
      {anyFlagged ? <p className="m-0 text-body-s text-fg-soft">Flagged means linked to known harmful activity.</p> : null}
      <div className="flex items-center justify-between gap-s3">
        {ranked.length >= cap ? (
          <p className="m-0 text-body-s text-fg-mute">Showing the first {cap} people Crowsnest has scored.</p>
        ) : (
          <span />
        )}
        {ranked.length > limit ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="label ml-auto inline-flex min-h-[2.75rem] min-w-[2.75rem] items-center justify-center rounded-ctl px-s2 text-fg-mute underline underline-offset-4 hover:text-fg"
          >
            {expanded ? `Show top ${limit}` : `Show all (${ranked.length})`}
          </button>
        ) : null}
      </div>
    </ChartFigure>
  );
}
