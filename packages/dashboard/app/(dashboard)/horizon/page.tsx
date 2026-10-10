'use client';

import { useId, useMemo } from 'react';
import { DailyCalls } from '@/components/charts/DailyCalls';
import { CallCard } from '@/components/console/CallCard';
import { useConsoleLive } from '@/components/console/ConsoleLiveProvider';
import { useIncidents, useStaleMarker, useStats, useNow } from '@/components/console/data';
import { Numerals } from '@/components/console/Numerals';
import { DataError, toChartError } from '@/components/console/PageStates';
import { useScan } from '@/components/console/ScanProvider';
import { useShortcutActions } from '@/components/console/ShortcutProvider';
import { EmptyNib, FirstRunStrip, Nib } from '@/components/mascot';
import { Button, EmptyBlock, NibNote, Panel, PanelGrid, Skeleton, SkeletonRows, type Stat } from '@/components/system';
import { compareCalls, countBuckets, statusSentence } from '@/lib/calls';
import { groupCalls } from '@/lib/console/groups';
import { horizonNote, horizonPose } from '@/lib/console/notes';
import { useUrlState } from '@/lib/console/url-state';
import { timeAgo } from '@/lib/time';
import type { Incident, StatsResult } from '@/lib/types';

const SHOWN = 5;
const WEEK = 7 * 86_400_000;

/** "was 4, a week ago": only when an older window exists. The API keeps no history, so this counts calls first seen over a week ago. */
function baseline(list: readonly Incident[], bucket: 'hold' | 'watch', now: number): string | undefined {
  const older = list.filter((i) => {
    const t = Date.parse(i.detected_at);
    return Number.isFinite(t) && now - t >= WEEK;
  });
  if (older.length === 0) return undefined;
  return `was ${countBuckets(older)[bucket]}, a week ago`;
}

function packagesChecked(s: StatsResult | undefined): number | null {
  if (!s) return null;
  return s.total_packages ?? s.table_counts.local_lockfiles ?? null;
}

export default function HorizonPage() {
  const inc = useIncidents();
  const stats = useStats();
  const stale = useStaleMarker(inc, stats);
  const scan = useScan();
  const live = useConsoleLive();
  const [{ focus }] = useUrlState({ focus: '' });
  const titleId = useId();
  useShortcutActions({ refresh: () => (inc.retry(), stats.retry()) });

  const list = inc.data;
  const now = useNow();
  const attention = useMemo(
    () => (list ?? []).filter((i) => i.severity !== 'LOW').sort(compareCalls),
    [list],
  );
  // Identical calls (same kind, packages and people) become one card; see lib/console/groups.ts.
  const groups = useMemo(() => groupCalls(attention), [attention]);
  const shown = useMemo(() => {
    const top = groups.slice(0, SHOWN);
    const f = focus ? groups.find((g) => g.lead.id === focus || g.others.some((o) => o.id === focus)) : undefined;
    return f && !top.includes(f) ? [...top.slice(0, SHOWN - 1), f] : top;
  }, [groups, focus]);

  const buckets = countBuckets(list ?? []);
  const checked = packagesChecked(stats.data);
  const loading = inc.loading;
  const failed = !!inc.error && !list;
  const lastScan = stats.data?.last_scan_at;
  const loaded = !!list && !!stats.data;
  // A scan exists if the API says so, or if it holds packages or calls. Only an empty store is "never scanned".
  const scanned = !!lastScan || (checked ?? 0) > 0 || (list ?? []).length > 0;
  const firstRun = loaded && !scanned;
  const holdShowing = attention.some((i) => i.severity === 'CRITICAL' || i.severity === 'HIGH');
  const noteState = { loaded: !!list && (!!stats.data || !!inc.data), scanned, hold: buckets.hold, watch: buckets.watch };
  const note = horizonNote(noteState);
  const pose = horizonPose(noteState);

  const items: Stat[] = [
    { id: 'hold', label: 'Hold', value: list ? buckets.hold : null, baseline: list ? baseline(list, 'hold', now) : undefined, hold: buckets.hold > 0 },
    { id: 'watch', label: 'Watch', value: list ? buckets.watch : null, baseline: list ? baseline(list, 'watch', now) : undefined },
    { id: 'checked', label: 'Packages checked', value: checked },
  ];

  const clearLine =
    checked && checked > 0
      ? `Nib checked ${checked.toLocaleString('en-US')} packages${lastScan ? ` ${timeAgo(lastScan, now)}` : ''} and found nothing to hold.`
      : 'Crowsnest has nothing to report yet.';

  const headline = !list
    ? null
    : attention.length > 0
      ? statusSentence(attention.length)
      : scanned
        ? 'All quiet from up here.'
        : 'No project scanned yet.';

  return (
    <div className="pt-s4">
      <PanelGrid lines>
        <section aria-labelledby={titleId} className="relative col-span-12 flex min-w-0 flex-col gap-s3 bg-surface p-s4">
          {pose ? (
            <div className="pointer-events-none absolute right-s4 top-s3" data-status-nib={pose}>
              <Nib pose={pose} size={96} animate={pose === 'perch'} className="max-md:h-auto max-md:w-16" />
            </div>
          ) : null}
          <h1 id={titleId} className={`m-0 min-h-[1.05em] text-display-m text-fg${pose ? ' pr-[4.5rem] md:pr-[7rem]' : ''}`}>
            {headline ? (
              headline
            ) : failed ? (
              'Crowsnest is not reachable.'
            ) : (
              <>
                <span className="sr-only">What needs your attention</span>
                <Skeleton className="h-10" width="55%" />
              </>
            )}
          </h1>
          <div className="min-h-[1.625rem]" title={note ? "Nib's note" : undefined}>
            {note ? <NibNote size="m">{note}</NibNote> : null}
          </div>
          {list && attention.length === 0 && scanned ? <p className="m-0 text-body-s text-fg-soft">{clearLine}</p> : null}
          <Numerals items={items} />
        </section>

        {firstRun ? (
          <section aria-label="Getting started" className="col-span-12 flex min-w-0 flex-col items-start gap-s4 bg-surface p-s4" data-first-run>
            <FirstRunStrip animate className="w-full" />
            <Button variant="tertiary" onClick={scan.openDialog}>
              Scan a project
            </Button>
          </section>
        ) : (
          <>
            <Panel label="Needs your attention" className="col-span-12 min-h-[20rem] lg:col-span-7" stale={stale} meta={<Button variant="tertiary" href="/log">See all in Log</Button>}>
              {loading ? (
                <SkeletonRows rows={3} rowHeight={96} label="Loading calls." />
              ) : failed ? (
                <DataError error={inc.error} onRetry={inc.retry} />
              ) : shown.length === 0 ? (
                <EmptyBlock sentence="Calls that need you will show up here." />
              ) : (
                <ul className="m-0 flex list-none flex-col gap-s3 p-0">
                  {shown.map((g) => (
                    <li key={g.lead.id} className="min-w-0">
                      <CallCard incident={g.lead} now={now} defaultOpen={!!focus && (g.lead.id === focus || g.others.some((o) => o.id === focus))} alsoCount={g.others.length} />
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel label="Last 30 days" className="col-span-12 min-h-[20rem] lg:col-span-5" stale={stale}>
              <DailyCalls
                incidents={list ?? []}
                loading={loading}
                error={failed ? toChartError(inc.error) : null}
                onRetry={inc.retry}
                live={live.status === 'live'}
                emptyAdornment={
                  // Hold showing anywhere on the page: plain sentence only, no Nib line.
                  holdShowing ? undefined : <EmptyNib size={80} text="A quiet month." />
                }
              />
            </Panel>
          </>
        )}
      </PanelGrid>
    </div>
  );
}
