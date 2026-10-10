'use client';

import { useMemo, useRef, useState } from 'react';
import { EcosystemBar } from '@/components/charts/EcosystemBar';
import { CallCard } from '@/components/console/CallCard';
import { ConsolePageHead } from '@/components/console/ConsolePageHead';
import { useIncidents, useLockfiles, useStaleMarker, useStats, useNow } from '@/components/console/data';
import { HoldDetail, useVeto, VetoResultView } from '@/components/console/HoldDetail';
import { Cameo, DataError } from '@/components/console/PageStates';
import { useScan } from '@/components/console/ScanProvider';
import { useShortcutActions } from '@/components/console/ShortcutProvider';
import {
  Button, DataTable, EmptyBlock, Gauge, NoFlags, Panel, PanelGrid, Select, SkeletonRows, TextInput, ToggleChip,
  type Column, type SortState,
} from '@/components/system';
import { compareCalls } from '@/lib/calls';
import { holdNote } from '@/lib/console/notes';
import { compareRows, ecosystemCounts, filterFlagged, filterRows, holdRows, projectLabel, shownLine, type HoldRow } from '@/lib/console/hold';
import { useUrlState } from '@/lib/console/url-state';

function Status({ row }: { row: HoldRow }) {
  return row.level ? <Gauge level={row.level} urgent={row.urgent} /> : <NoFlags />;
}

export default function HoldPage() {
  const lock = useLockfiles();
  const inc = useIncidents();
  const stats = useStats();
  const stale = useStaleMarker(lock, inc);
  const scan = useScan();
  const [f, update, reset] = useUrlState({ q: '', eco: 'all', flag: '' });
  const [sort, setSort] = useState<SortState>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [check, setCheck] = useState('');
  const veto = useVeto();
  const search = useRef<HTMLInputElement>(null);
  useShortcutActions({
    refresh: () => (lock.retry(), inc.retry(), stats.retry()),
    focusFilter: () => search.current?.focus(),
    escape: () => {
      if (!selectedKey) return false;
      setSelectedKey(null);
      return true;
    },
  });

  const entries = lock.data;
  const all = useMemo(() => (entries ? holdRows(entries, inc.data ?? []).sort(compareRows) : []), [entries, inc.data]);
  const rows = useMemo(() => filterFlagged(filterRows(all, f.q, f.eco), f.flag === '1'), [all, f.q, f.eco, f.flag]);
  const selected = rows.find((r) => r.key === selectedKey) ?? null;
  const ecosystems = useMemo(() => ecosystemCounts(all).map((e) => e.ecosystem), [all]);
  // The backend repeats every package under a second project path; rows are de-duplicated at the boundary,
  // so the true total is the distinct package count Horizon also prints.
  const total = stats.data?.total_packages ?? null;
  const filtered = f.q.trim() !== '' || f.eco !== 'all' || f.flag === '1';
  const now = useNow();
  const failed = !!lock.error && !entries;
  // The Held shelf: up to three distinct calls that touch an installed package (Hold or Watch).
  const held = useMemo(() => {
    const seen = new Map<string, NonNullable<HoldRow['incident']>>();
    for (const r of all) if (r.incident && r.rank <= 2 && !seen.has(r.incident.id)) seen.set(r.incident.id, r.incident);
    return [...seen.values()].sort(compareCalls);
  }, [all]);
  const shelf = held.slice(0, 3);

  const columns: Column<HoldRow>[] = useMemo(
    () => [
      {
        id: 'package',
        header: 'Package',
        sortValue: (r) => r.entry.package,
        cell: (r) => (
          <button
            type="button"
            onClick={() => setSelectedKey(r.key)}
            aria-label={`${r.entry.package} ${r.entry.version}, show details`}
            className="block min-h-10 w-full min-w-0 truncate text-left text-fg hover:text-brand max-md:min-h-11"
          >
            {r.entry.package}
          </button>
        ),
      },
      { id: 'version', header: 'Version', width: '7.5rem', mono: true, sortValue: (r) => r.entry.version, cell: (r) => <span className="block truncate">{r.entry.version}</span> },
      {
        id: 'project',
        header: 'Project',
        hideBelow: 768,
        sortValue: (r) => r.entry.project_path.toLowerCase(),
        cell: (r) => (
          <span className="block truncate text-[0.8125rem] text-fg-soft">
            {projectLabel(r.entry.project_path)}
          </span>
        ),
      },
      { id: 'status', header: 'Status', width: '10.5rem', sortValue: (r) => r.rank, cell: (r) => <Status row={r} /> },
    ],
    [],
  );

  return (
    <>
      <ConsolePageHead title="What is installed" note={entries ? holdNote(held.length > 0) : null} />
      <PanelGrid lines>
        <Panel label="Find a package" className="col-span-12" stale={stale}>
          <div className="flex flex-wrap items-end gap-x-s4 gap-y-s3">
            <div className="w-full min-w-0 md:w-64">
              <TextInput id="hold-search" label="Search packages" shortcut="/" inputRef={search} value={f.q} onChange={(q) => update({ q })} placeholder="Search packages" />
            </div>
            <div className="w-full min-w-0 md:w-48">
              <Select
                id="hold-eco"
                label="Ecosystem"
                value={f.eco}
                onChange={(eco) => update({ eco })}
                options={[{ value: 'all', label: 'All ecosystems' }, ...ecosystems.map((e) => ({ value: e, label: e }))]}
              />
            </div>
            <div className="flex items-end">
              <ToggleChip pressed={f.flag === '1'} onPressedChange={(p) => update({ flag: p ? '1' : '' })}>
                Flagged only
              </ToggleChip>
            </div>
            <form
              className="flex w-full min-w-0 flex-wrap items-end gap-s2 md:w-auto"
              onSubmit={(e) => {
                e.preventDefault();
                const name = check.trim();
                if (name) void veto.run(name, undefined, f.eco === 'all' ? 'npm' : f.eco);
              }}
            >
              <div className="min-w-0 flex-1 md:w-56 md:flex-none">
                <TextInput id="hold-check" label="Check this package" value={check} onChange={setCheck} placeholder="package name" autoComplete="off" spellCheck={false} />
              </div>
              <Button type="submit" variant="secondary" arrow disabled={check.trim() === ''}>
                Check
              </Button>
            </form>
          </div>
          <div className="mt-s3">
            <VetoResultView state={veto.state} />
          </div>
        </Panel>

        {shelf.length > 0 ? (
          <Panel
            label="Held"
            className="col-span-12"
            stale={stale}
            meta={
              <Button variant="tertiary" href="/log">
                See all in Log
              </Button>
            }
          >
            <p className="m-0 mb-s3 text-body-s text-fg-soft">Up to 3 packages with a Hold or Watch call.</p>
            <ul className="m-0 grid list-none grid-cols-1 gap-s3 p-0 lg:grid-cols-3" data-held-shelf>
              {shelf.map((i) => (
                <li key={i.id} className="min-w-0">
                  <CallCard incident={i} now={now} />
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}

        <Panel label="Packages" className="col-span-12" stale={stale}>
          <p className="m-0 mb-s3 min-h-6 whitespace-nowrap text-body text-fg-soft" data-testid="shown-line">
            {entries ? shownLine(rows.length, total, filtered) : ' '}
          </p>
          {entries && ecosystems.length > 1 ? (
            <div className="mb-s4">
              <EcosystemBar rows={rows.map((r) => ({ ecosystem: r.entry.ecosystem }))} error={null} />
            </div>
          ) : null}
          {lock.loading ? (
            <SkeletonRows rows={8} label="Loading packages." />
          ) : failed ? (
            <DataError error={lock.error} onRetry={lock.retry} art={false} />
          ) : (
            <div className="grid min-w-0 gap-s4 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="min-w-0">
                <DataTable
                  ariaLabel="Packages"
                  caption="Installed packages, worst first"
                  columns={columns}
                  rows={rows}
                  rowKey={(r) => r.key}
                  sort={sort}
                  onSortChange={setSort}
                  windowed
                  rowHeight={40}
                  stackedBelow={768}
                  renderStacked={(r) => (
                    <div className="flex min-w-0 flex-col gap-1 py-s1">
                      <button type="button" onClick={() => setSelectedKey(r.key)} className="min-h-11 min-w-0 truncate text-left text-fg">
                        {r.entry.package} <span className="font-mono text-fg-mute">{r.entry.version}</span>
                      </button>
                      <Status row={r} />
                    </div>
                  )}
                  selectedKey={selectedKey}
                  onActivate={(r) => setSelectedKey(r.key)}
                  empty={
                    all.length === 0 ? (
                      <Cameo pose="spy" line="Nothing aboard yet.">
                        <p className="m-0 text-body-s text-fg-soft">Scan a project to list what is installed.</p>
                        <Button onClick={scan.openDialog}>Scan a project</Button>
                      </Cameo>
                    ) : held.length > 0 ? (
                      // A Hold is on this page: no Nib line, only the plain sentence.
                      <EmptyBlock sentence="No packages match.">
                        <Button variant="tertiary" arrow={false} onClick={reset}>
                          Clear filters
                        </Button>
                      </EmptyBlock>
                    ) : (
                      <Cameo pose="squint" line="No package by that name aboard.">
                        <Button variant="tertiary" arrow={false} onClick={reset}>
                          Clear filters
                        </Button>
                      </Cameo>
                    )
                  }
                />
              </div>
              <aside aria-label="Selected package" className="min-w-0 border-rule lg:border-l lg:pl-s4">
                {selected ? (
                  <HoldDetail key={selected.key} row={selected} now={now} />
                ) : (
                  <p className="m-0 text-body-s text-fg-soft">Pick a package to see why it is here.</p>
                )}
              </aside>
            </div>
          )}
        </Panel>
      </PanelGrid>
    </>
  );
}

