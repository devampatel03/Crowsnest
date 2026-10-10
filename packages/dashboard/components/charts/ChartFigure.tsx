'use client';

import { useId, useState, type ReactNode } from 'react';
import { cn } from '@/lib/format';

export interface DataTableSpec {
  caption: string;
  headers: string[];
  rows: (string | number)[][];
}

/**
 * Every chart lives in a figure with an aria-label, a one-sentence summary and a data
 * table. The table is visually hidden by default and a View as table toggle shows it to
 * sighted keyboard users. Colour is never the only carrier: the table prints
 * every value and the severity words.
 */
export function ChartFigure({
  ariaLabel,
  summary,
  table,
  children,
  className,
  toggle = true,
  forceTable = false,
}: {
  ariaLabel: string;
  summary: string;
  table: DataTableSpec;
  children: ReactNode;
  className?: string;
  toggle?: boolean;
  /** Show the table instead of the plot (narrow screens where the plot cannot be read). */
  forceTable?: boolean;
}) {
  const [toggled, setAsTable] = useState(false);
  const asTable = toggled || forceTable;
  const tableId = useId();
  return (
    <figure aria-label={ariaLabel} className={cn('m-0 flex min-w-0 flex-col gap-s2', className)}>
      <p className="sr-only">{summary}</p>
      <div hidden={asTable} aria-hidden={asTable ? true : undefined}>
        {children}
      </div>
      <div id={tableId} tabIndex={asTable ? 0 : undefined} role={asTable ? 'region' : undefined} aria-label={asTable ? table.caption : undefined} className={asTable ? 'max-h-72 overflow-auto' : 'sr-only'}>
        <table className="w-full border-collapse text-[0.75rem] tabular-nums text-fg-soft">
          <caption className={asTable ? 'label pb-s2 text-left' : 'sr-only'}>{table.caption}</caption>
          <thead>
            <tr>
              {table.headers.map((h) => (
                <th key={h} scope="col" className="label border-b border-rule px-s2 py-s1 text-left font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.length === 0 ? (
              <tr>
                <td colSpan={table.headers.length} className="px-s2 py-s1">
                  No rows.
                </td>
              </tr>
            ) : (
              table.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) =>
                    j === 0 ? (
                      <th key={j} scope="row" className="border-b border-rule px-s2 py-s1 text-left font-normal tabular-nums">
                        {c}
                      </th>
                    ) : (
                      <td key={j} className="border-b border-rule px-s2 py-s1 tabular-nums">
                        {c}
                      </td>
                    ),
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {toggle && !forceTable ? (
        <div className="flex justify-end">
          <button
            type="button"
            aria-pressed={toggled}
            aria-controls={tableId}
            onClick={() => setAsTable((v) => !v)}
            className="label inline-flex min-h-[2.75rem] min-w-[2.75rem] items-center justify-center rounded-ctl px-s2 text-fg-mute underline underline-offset-4 hover:text-fg"
          >
            {toggled ? 'View as chart' : 'View as table'}
          </button>
        </div>
      ) : null}
    </figure>
  );
}
