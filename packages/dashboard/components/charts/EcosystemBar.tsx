'use client';

import { memo, useMemo } from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { EmptyBlock } from '@/components/system/Blocks';
import { SkeletonRows } from '@/components/system/Skeleton';
import { ChartFigure } from './ChartFigure';
import { ChartErrorBlock } from './ChartStates';
import { TooltipPanel } from './ChartTooltip';
import type { EcosystemBarProps } from './contracts';
import { chartTheme, neutralTints } from './theme';
import { countByEcosystem, ecosystemLine, ecosystemStackRow, hasEcosystemSplit, normaliseCounts } from './transforms';
import { useMountAnimation } from './useMountAnimation';

const tint = (i: number): string => neutralTints[Math.min(i, neutralTints.length - 1)];

/** The bar. Exported so tests can mount with a fixed width and height. */
export const EcosystemStack = memo(function EcosystemStack({
  counts,
  animate,
  width,
  height,
}: {
  counts: { ecosystem: string; count: number }[];
  animate: boolean;
  width?: number;
  height?: number;
}) {
  const row = useMemo(() => [ecosystemStackRow(counts)], [counts]);
  const total = counts.reduce((a, c) => a + c.count, 0);
  return (
    <BarChart layout="vertical" width={width} height={height} data={row} margin={{ top: 4, right: 0, bottom: 4, left: 0 }} barCategoryGap={0}>
      <XAxis type="number" hide domain={[0, total || 1]} />
      <YAxis type="category" dataKey="name" hide />
      <Tooltip
        shared={false}
        cursor={false}
        isAnimationActive={false}
        content={({ active, payload }) => {
          const p = active ? payload?.[0] : undefined;
          if (!p) return null;
          const count = Number(p.value ?? 0);
          return (
            <TooltipPanel
              title={String(p.dataKey)}
              rows={[
                { label: 'Packages', value: count },
                { label: 'Share', value: total ? ((count / total) * 100).toFixed(1) : '0.0', tag: '%' },
              ]}
            />
          );
        }}
      />
      {counts.map((c, i) => (
        <Bar
          key={c.ecosystem}
          dataKey={c.ecosystem}
          stackId="eco"
          barSize={16}
          radius={0}
          fill={tint(i)}
          stroke={chartTheme.surface}
          strokeWidth={1}
          isAnimationActive={animate}
          animationDuration={chartTheme.animationMs}
        />
      ))}
    </BarChart>
  );
});

/**
 * Hold, above the package list: ONE stacked bar of packages by ecosystem in
 * neutral steps, with direct labels beneath (`npm 412 · pypi 38`). Not a donut,
 * no legend, nothing coloured by ecosystem. Pass the FILTERED rows or counts.
 * Returns null with only one ecosystem (a solid bar would repeat the total); the call
 * site can test hasEcosystemSplit(countByEcosystem(rows)) from transforms.ts.
 */
export function EcosystemBar({ counts, rows, loading, error, onRetry, emptyText, className }: EcosystemBarProps) {
  const data = useMemo(() => (counts ? normaliseCounts(counts) : countByEcosystem(rows ?? [])), [counts, rows]);
  const line = useMemo(() => ecosystemLine(data), [data]);
  const total = data.reduce((a, c) => a + c.count, 0);
  const animate = useMountAnimation();

  if (error) return <ChartErrorBlock error={error} onRetry={onRetry} />;
  if (loading) return <SkeletonRows rows={1} rowHeight={32} label="Loading packages." />;
  if (total > 0 && !hasEcosystemSplit(data)) return null; // one ecosystem: the table already says it
  if (total === 0) {
    return <EmptyBlock sentence={emptyText ?? 'No packages to split by ecosystem. Nothing matches this filter.'} />;
  }

  return (
    <ChartFigure
      className={className}
      ariaLabel="Packages by ecosystem."
      summary={`${total} packages: ${line}.`}
      table={{
        caption: 'Packages by ecosystem',
        headers: ['Ecosystem', 'Packages', 'Share'],
        rows: data.map((c) => [c.ecosystem, c.count, `${((c.count / total) * 100).toFixed(1)}%`]),
      }}
    >
      <div aria-hidden="true" className="h-6 min-h-6 w-full">
        <ResponsiveContainer width="100%" height="100%" minHeight={24}>
          <EcosystemStack counts={data} animate={animate} />
        </ResponsiveContainer>
      </div>
      <ul className="m-0 flex list-none flex-wrap gap-x-s4 gap-y-s1 p-0 text-[0.75rem] tabular-nums text-fg-soft">
        {data.map((c, i) => (
          <li key={c.ecosystem} className="flex items-center gap-s1">
            <span aria-hidden="true" className="inline-block h-2 w-2 rounded-[2px]" style={{ background: tint(i) }} />
            {c.ecosystem} {c.count}
          </li>
        ))}
      </ul>
    </ChartFigure>
  );
}
