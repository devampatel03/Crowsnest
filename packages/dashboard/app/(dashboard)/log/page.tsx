'use client';

import { useMemo, useRef } from 'react';
import { DailyCalls } from '@/components/charts/DailyCalls';
import { CallRow } from '@/components/console/CallCard';
import { ConsolePageHead } from '@/components/console/ConsolePageHead';
import { useIncidents, useStaleMarker, useNow } from '@/components/console/data';
import { Cameo, DataError } from '@/components/console/PageStates';
import { useConsoleLive } from '@/components/console/ConsoleLiveProvider';
import { useScan } from '@/components/console/ScanProvider';
import { useShortcutActions } from '@/components/console/ShortcutProvider';
import { Button, Panel, PanelGrid, Rope, SkeletonRows, TextInput, ToggleChip } from '@/components/system';
import { filtersActive, filterLog, groupByDate, LOG_DEFAULTS, LOG_PAGE_SIZE, newestFirst, pageCount, pageOf, validateRange } from '@/lib/console/log';
import { LOG_NOTE } from '@/lib/console/notes';
import { useUrlState } from '@/lib/console/url-state';

const LEVELS = [
  { id: 'hold', label: 'Hold' },
  { id: 'watch', label: 'Watch' },
  { id: 'note', label: 'Note' },
] as const;

export default function LogPage() {
  const inc = useIncidents();
  const stale = useStaleMarker(inc);
  const scan = useScan();
  const live = useConsoleLive();
  const [f, update, reset] = useUrlState({ ...LOG_DEFAULTS });
  const search = useRef<HTMLInputElement>(null);
  useShortcutActions({ refresh: inc.retry, focusFilter: () => search.current?.focus() });

  const all = inc.data;
  const rows = useMemo(() => newestFirst(filterLog(all ?? [], f)), [all, f]);
  const page = pageOf(f.page, rows.length);
  const pages = pageCount(rows.length);
  const visible = rows.slice((page - 1) * LOG_PAGE_SIZE, page * LOG_PAGE_SIZE);
  const on = new Set(f.v.split(',').filter(Boolean));
  const rangeError = validateRange(f.from, f.to);
  const now = useNow();
  const groups = useMemo(() => groupByDate(visible, now), [visible, now]);
  const recent = (all ?? []).some((i) => now - (Date.parse(i.detected_at) || 0) <= 30 * 86_400_000);

  const toggle = (id: string, pressed: boolean) => {
    const next = new Set(on);
    if (pressed) next.add(id);
    else next.delete(id);
    update({ v: LEVELS.filter((l) => next.has(l.id)).map((l) => l.id).join(','), page: '1' });
  };

  const failed = !!inc.error && !all;

  return (
    <>
      <ConsolePageHead title="Everything Crowsnest has called" note={LOG_NOTE} />
      <PanelGrid lines>
        <Panel label="Calls" className="col-span-12 min-h-[26.25rem]" stale={stale} meta={all ? <span className="label">{rows.length.toLocaleString('en-US')} shown</span> : null}>
          {all && recent ? (
            <div className="mb-s4" data-log-spark>
              <DailyCalls incidents={all} variant="spark" height={48} live={live.status === 'live'} />
            </div>
          ) : null}
          <div className="mb-s4 flex flex-wrap items-end gap-x-s4 gap-y-s3">
            <div role="group" aria-label="Seriousness" className="flex flex-wrap gap-s2">
              {LEVELS.map((l) => (
                <ToggleChip key={l.id} pressed={on.has(l.id)} onPressedChange={(p) => toggle(l.id, p)}>
                  {l.label}
                </ToggleChip>
              ))}
            </div>
            <div className="w-full min-w-0 md:w-64">
              <TextInput id="log-search" label="Search calls" shortcut="/" inputRef={search} value={f.q} onChange={(q) => update({ q, page: '1' })} placeholder="Package or what happened" />
            </div>
            <div className="w-[calc(50%-0.375rem)] min-w-0 md:w-40">
              <TextInput id="log-from" label="From" type="date" value={f.from} onChange={(from) => update({ from, page: '1' })} error={rangeError ?? undefined} />
            </div>
            <div className="w-[calc(50%-0.375rem)] min-w-0 md:w-40">
              <TextInput id="log-to" label="To" type="date" value={f.to} onChange={(to) => update({ to, page: '1' })} />
            </div>
          </div>

          {inc.loading ? (
            <SkeletonRows rows={6} label="Loading calls." />
          ) : failed ? (
            <DataError error={inc.error} onRetry={inc.retry} />
          ) : (all ?? []).length === 0 ? (
            <Cameo pose="quiet" line="Nothing logged yet.">
              <p className="m-0 text-body-s text-fg-soft">Scan a project to start.</p>
              <Button onClick={scan.openDialog}>Scan a project</Button>
            </Cameo>
          ) : rows.length === 0 ? (
            <Cameo pose="quiet" line="Nothing logged here. Clear the filters and I'll look again.">
              {filtersActive(f) ? (
                <Button variant="tertiary" arrow={false} onClick={reset}>
                  Clear filters
                </Button>
              ) : null}
            </Cameo>
          ) : (
            <>
              <div className="relative pl-[1.75rem]" data-rope-timeline>
                <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-[0.5rem] w-0">
                  <Rope />
                </div>
                {groups.map((g) => (
                  <section key={g.group} aria-label={g.group} className="mb-s3 last:mb-0">
                    <h3 className="m-0 pb-s1 pt-s1 text-h3 text-fg">{g.group}</h3>
                    <ul className="m-0 list-none p-0">
                      {g.items.map((i) => (
                        <CallRow key={i.id} incident={i} now={now} knot />
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
              {pages > 1 ? (
                <nav aria-label="Pages" className="mt-s4 flex flex-wrap items-center gap-s4">
                  <Button variant="secondary" arrow={false} disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}>
                    Previous
                  </Button>
                  <span className="text-body-s text-fg-soft" aria-live="polite">
                    Page {page}
                  </span>
                  <Button variant="secondary" arrow={false} disabled={page >= pages} onClick={() => update({ page: String(page + 1) })}>
                    Next
                  </Button>
                </nav>
              ) : null}
            </>
          )}
        </Panel>
      </PanelGrid>
    </>
  );
}
