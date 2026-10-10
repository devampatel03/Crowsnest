'use client';

import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/format';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { useWindowedRows } from '@/lib/hooks/useWindowedRows';
import { Button } from './Button';
import { SkeletonRows } from './Skeleton';

export type Column<T> = {
  id: string;
  header: string;
  width?: string;
  cell: (row: T, ctx: { index: number; selected: boolean }) => ReactNode;
  sortValue?: (row: T) => string | number;
  align?: 'left' | 'right';
  mono?: boolean;
  hideBelow?: 768 | 1024 | 1280;
  className?: string;
};
export type SortState = { id: string; dir: 'asc' | 'desc' } | null;

/** Pure: stable sort by a column's sortValue. Returns the input order when sort is null or the column is unsortable. */
export function sortRows<T>(rows: T[], columns: Column<T>[], sort: SortState): T[] {
  if (!sort) return rows;
  const col = columns.find((c) => c.id === sort.id);
  if (!col?.sortValue) return rows;
  const get = col.sortValue;
  const dir = sort.dir === 'asc' ? 1 : -1;
  return rows
    .map((r, i) => ({ r, i, v: get(r) }))
    .sort((a, b) => {
      const cmp =
        typeof a.v === 'number' && typeof b.v === 'number'
          ? a.v - b.v
          : String(a.v).localeCompare(String(b.v), 'en', { numeric: true });
      return cmp !== 0 ? cmp * dir : a.i - b.i;
    })
    .map((x) => x.r);
}

/** Pure: asc -> desc -> none cycle for a header button. */
export function nextSort(current: SortState, id: string): SortState {
  if (!current || current.id !== id) return { id, dir: 'asc' };
  if (current.dir === 'asc') return { id, dir: 'desc' };
  return null;
}

const HIDE: Record<number, string> = { 768: 'max-md:hidden', 1024: 'max-lg:hidden', 1280: 'max-xl:hidden' };

function template<T>(cols: Column<T>[], minWidth: number, extra: string | null): string {
  // Columns visible at a given viewport width (hideBelow = first width at which the column shows).
  const parts = cols.filter((c) => !c.hideBelow || c.hideBelow <= minWidth).map((c) => c.width ?? 'minmax(0,1fr)');
  if (extra) parts.push(extra);
  return parts.join(' ');
}

export function DataTable<T>(p: {
  ariaLabel: string;
  caption?: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  sort?: SortState;
  onSortChange?: (s: SortState) => void;
  windowed?: boolean;
  rowHeight?: number;
  stackedBelow?: 768;
  renderStacked?: (row: T, ctx: { index: number; selected: boolean }) => ReactNode;
  focusedKey?: string | null;
  onFocusedKeyChange?: (k: string | null) => void;
  onActivate?: (row: T) => void;
  /** The one row whose detail is open: pressed fill and a 2px beam bar. Single selection only. */
  selectedKey?: string | null;
  renderExpanded?: (row: T) => ReactNode;
  expandedKeys?: ReadonlySet<string>;
  onToggleExpanded?: (k: string) => void;
  loading?: boolean;
  skeletonRows?: number;
  empty?: ReactNode;
  footer?: ReactNode;
  capNote?: string | null;
  pendingInsertCount?: number;
  onApplyInserts?: () => void;
}) {
  const {
    ariaLabel, caption, columns, rows, rowKey, sort = null, onSortChange, windowed = false, rowHeight = 40,
    stackedBelow, renderStacked, focusedKey, onFocusedKeyChange, onActivate, selectedKey, renderExpanded,
    expandedKeys, onToggleExpanded, loading, skeletonRows = 8, empty, footer, capNote, pendingInsertCount, onApplyInserts,
  } = p;

  const uid = useId();
  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  const isStacked = !!stackedBelow && !!renderStacked;
  const narrow = useMediaQuery('(max-width: 767px)');
  const stackedNow = isStacked && narrow;
  const effHeight = stackedNow ? 64 : rowHeight;

  const sorted = useMemo(() => sortRows(rows, columns, sort), [rows, columns, sort]);
  const keys = useMemo(() => sorted.map(rowKey), [sorted, rowKey]);
  const expandable = !!renderExpanded && !windowed; // variable-height rows cannot be windowed

  const [innerFocus, setInnerFocus] = useState<string | null>(null);
  const currentKey = focusedKey !== undefined ? focusedKey : innerFocus;
  const focusIdx = Math.max(0, currentKey ? keys.indexOf(currentKey) : 0);
  const pendingFocus = useRef<number | null>(null);

  const win = useWindowedRows({ count: sorted.length, rowHeight: effHeight, scrollRef });
  const start = windowed ? win.start : 0;
  const end = windowed ? win.end : sorted.length;

  const moveFocus = useCallback(
    (i: number) => {
      const idx = Math.max(0, Math.min(i, keys.length - 1));
      const k = keys[idx];
      if (k === undefined) return;
      setInnerFocus(k);
      onFocusedKeyChange?.(k);
      pendingFocus.current = idx;
      if (windowed) win.scrollToIndex(idx);
    },
    [keys, onFocusedKeyChange, windowed, win],
  );

  // Move real focus after the target row has rendered (it may have just been windowed in).
  useEffect(() => {
    const idx = pendingFocus.current;
    if (idx === null) return;
    const el = bodyRef.current?.querySelector<HTMLElement>(`[data-row-index="${idx}"]`);
    if (el) {
      el.focus();
      pendingFocus.current = null;
    }
  });

  function onRowKeyDown(e: KeyboardEvent<HTMLElement>, row: T, i: number) {
    if (e.target !== e.currentTarget) return; // never hijack keys from inner controls
    const k = keys[i];
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    switch (e.key) {
      case 'ArrowDown':
      case 'j':
        e.preventDefault();
        moveFocus(i + 1);
        break;
      case 'ArrowUp':
      case 'k':
        e.preventDefault();
        moveFocus(i - 1);
        break;
      case 'Home':
        e.preventDefault();
        moveFocus(0);
        break;
      case 'End':
        e.preventDefault();
        moveFocus(keys.length - 1);
        break;
      case 'Enter':
        if (expandable) {
          e.preventDefault();
          onToggleExpanded?.(k);
        } else if (onActivate) {
          e.preventDefault();
          onActivate(row);
        }
        break;
      case ' ':
        if (expandable) {
          e.preventDefault();
          onToggleExpanded?.(k);
        }
        break;
    }
  }

  const cols = columns;
  const extra = expandable ? '2.5rem' : null;
  const vars = {
    '--cols-base': template(cols, 0, extra),
    '--cols-md': template(cols, 768, extra),
    '--cols-lg': template(cols, 1024, extra),
    '--cols-xl': template(cols, 1280, extra),
  } as React.CSSProperties;
  const gridCls =
    '[grid-template-columns:var(--cols-base)] md:[grid-template-columns:var(--cols-md)] lg:[grid-template-columns:var(--cols-lg)] xl:[grid-template-columns:var(--cols-xl)]';
  const hideCls = (c: Column<T>) => (c.hideBelow ? HIDE[c.hideBelow] : '');
  const showCells = !isStacked; // stacked rows replace the cells below 768 through CSS

  const visible = sorted.slice(start, end);
  const showBody = !loading && sorted.length > 0;

  return (
    <div className="flex min-w-0 flex-col bg-surface">
      {pendingInsertCount && pendingInsertCount > 0 ? (
        <div className="border-b border-rule px-s3 py-s2">
          <Button variant="tertiary" onClick={onApplyInserts}>
            {`Show ${pendingInsertCount} new`}
          </Button>
        </div>
      ) : null}
      <div
        ref={scrollRef}
        className={cn(windowed && 'overflow-auto')}
        style={windowed ? { maxHeight: '70vh' } : undefined}
      >
        <table
          role="table"
          aria-label={ariaLabel}
          aria-rowcount={windowed ? sorted.length + 1 : undefined}
          className="block w-full border-collapse text-body-s text-fg"
          style={vars}
        >
          <caption className="sr-only">{caption ?? ariaLabel}</caption>
          <thead
            role="rowgroup"
            className={cn('block bg-surface', windowed ? 'sticky top-0 z-10' : 'sticky top-console-header z-10', stackedNow && 'hidden')}
          >
            <tr role="row" aria-rowindex={windowed ? 1 : undefined} className={cn('grid border-b border-rule-strong', gridCls)}>
              {cols.map((c) => {
                const isSorted = sort?.id === c.id;
                const ariaSort = c.sortValue ? (isSorted ? (sort?.dir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined;
                return (
                  <th
                    key={c.id}
                    role="columnheader"
                    scope="col"
                    aria-sort={ariaSort}
                    className={cn('min-w-0 px-s3 py-s2 text-left font-normal', c.align === 'right' && 'text-right', hideCls(c))}
                  >
                    {c.sortValue ? (
                      <button
                        type="button"
                        onClick={() => onSortChange?.(nextSort(sort, c.id))}
                        className="label inline-flex min-h-6 items-center gap-1 hover:text-fg max-md:min-h-11"
                      >
                        {c.header}
                        <span aria-hidden="true">{isSorted ? (sort?.dir === 'asc' ? '↑' : '↓') : ''}</span>
                        {isSorted ? <span className="sr-only">{sort?.dir}</span> : null}
                      </button>
                    ) : (
                      <span className="label">{c.header}</span>
                    )}
                  </th>
                );
              })}
              {expandable ? (
                <th role="columnheader" scope="col" className="px-s2 py-s2">
                  <span className="sr-only">Details</span>
                </th>
              ) : null}
            </tr>
          </thead>

          {showBody ? (
            <tbody ref={bodyRef} role="rowgroup" className="block">
              {windowed && win.padTop > 0 ? <tr aria-hidden="true" className="block" style={{ height: win.padTop }} /> : null}
              {visible.map((row, vi) => {
                const i = start + vi;
                const k = keys[i];
                const selected = selectedKey === k;
                const open = expandable && !!expandedKeys?.has(k);
                const ctx = { index: i, selected };
                const panelId = `${uid}-x-${i}`;
                return (
                  <Fragment key={k}>
                    <tr
                      role="row"
                      data-row-index={i}
                      data-row-key={k}
                      aria-rowindex={windowed ? i + 2 : undefined}
                      aria-selected={selectedKey !== undefined ? selected : undefined}
                      tabIndex={i === focusIdx ? 0 : -1}
                      onKeyDown={(e) => onRowKeyDown(e, row, i)}
                      onFocus={(e) => {
                        if (e.target === e.currentTarget && keys[i] !== currentKey) {
                          setInnerFocus(keys[i]);
                          onFocusedKeyChange?.(keys[i]);
                        }
                      }}
                      style={windowed ? { height: effHeight } : { minHeight: effHeight }}
                      className={cn(
                        'grid items-center border-b border-l-2 border-rule border-l-transparent transition-colors duration-ui ease-lookout hover:bg-raised focus-visible:outline-offset-[-2px]',
                        windowed && 'overflow-hidden',
                        selected && 'border-l-brand bg-pressed hover:bg-pressed',
                        gridCls,
                      )}
                    >
                      {showCells
                        ? cols.map((c) => (
                            <td
                              key={c.id}
                              role="cell"
                              className={cn('min-w-0 overflow-hidden px-s3 py-1', c.mono && 'font-mono', c.align === 'right' && 'text-right', hideCls(c), c.className)}
                            >
                              {c.cell(row, ctx)}
                            </td>
                          ))
                        : null}
                      {isStacked ? (
                        <>
                          {cols.map((c) => (
                            <td
                              key={c.id}
                              role="cell"
                              className={cn('min-w-0 overflow-hidden px-s3 py-1 max-md:hidden', c.mono && 'font-mono', c.align === 'right' && 'text-right', hideCls(c), c.className)}
                            >
                              {c.cell(row, ctx)}
                            </td>
                          ))}
                          <td role="cell" className="col-span-full min-w-0 overflow-hidden px-s3 py-1 md:hidden">
                            {renderStacked?.(row, ctx)}
                          </td>
                        </>
                      ) : null}
                      {expandable ? (
                        <td role="cell" className="px-s2 py-1">
                          <button
                            type="button"
                            aria-expanded={open}
                            aria-controls={panelId}
                            aria-label={open ? 'Hide details' : 'Show details'}
                            onClick={() => onToggleExpanded?.(k)}
                            className="inline-flex size-6 items-center justify-center rounded-ctl border border-field text-[0.8125rem] hover:bg-pressed max-md:size-11"
                          >
                            {open ? '−' : '+'}
                          </button>
                        </td>
                      ) : null}
                    </tr>
                    {expandable ? (
                      <tr role="row" hidden={!open} id={panelId} className="block border-b border-rule bg-raised">
                        <td role="cell" className="block px-s4 py-s3">
                          {open ? renderExpanded?.(row) : null}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
              {windowed && win.padBottom > 0 ? <tr aria-hidden="true" className="block" style={{ height: win.padBottom }} /> : null}
            </tbody>
          ) : null}
        </table>
      </div>

      {loading ? <SkeletonRows rows={skeletonRows} rowHeight={effHeight} label={`Loading ${ariaLabel}`} /> : null}
      {!loading && sorted.length === 0 ? empty : null}
      {capNote ? <p className="label m-0 px-s3 py-s2">{capNote}</p> : null}
      {!loading ? footer : null}
    </div>
  );
}
