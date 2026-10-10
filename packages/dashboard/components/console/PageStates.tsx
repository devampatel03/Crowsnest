'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { ChartError } from '@/components/charts/contracts';
import { ErrorNib, Nib, OfflineNib, type NibPose } from '@/components/mascot';
import { Button, ErrorBlock, Panel, PanelGrid, Skeleton, SkeletonRows, StatStrip } from '@/components/system';
import { describeError, isUnreachable } from '@/lib/api';

const HELP = { href: '/docs/troubleshooting', label: 'How to start it' } as const;

/**
 * Plain-words error for a failed data request. `describeError` is the only
 * source of the sentence. By default it is illustrated: `OfflineNib` (lantern)
 * when Crowsnest cannot be reached, `ErrorNib` (oops) for anything else, each
 * with Nib's one line first and the plain sentence second.
 *
 * `art={false}` is for any panel that may hold a Hold: the same sentence and
 * actions, no drawing, no Nib line.
 */
export function DataError({ error, onRetry, art = true }: { error: unknown; onRetry?: () => void; art?: boolean }) {
  const unreachable = isUnreachable(error);
  if (!art) return <ErrorBlock what={describeError(error)} onRetry={onRetry} help={unreachable ? HELP : undefined} />;
  const actions = (
    <div className="mt-s2 flex flex-wrap items-center gap-x-s4 gap-y-s2">
      {onRetry ? (
        <Button variant="tertiary" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
      {unreachable ? (
        <Button variant="tertiary" href={HELP.href}>
          {HELP.label}
        </Button>
      ) : null}
    </div>
  );
  const body = (
    <>
      <p className="m-0 text-body text-fg">{describeError(error)}</p>
      {actions}
    </>
  );
  return (
    <div className="p-s4" data-state={unreachable ? 'offline' : 'error'} role={unreachable ? 'alert' : undefined}>
      {unreachable ? (
        <OfflineNib size={120}>{body}</OfflineNib>
      ) : (
        <ErrorNib size={120} text="Something slipped on our side.">
          {body}
        </ErrorNib>
      )}
    </div>
  );
}

/** The same sentence for a chart's `error` prop. */
export function toChartError(error: unknown): ChartError {
  return { what: describeError(error), help: isUnreachable(error) ? { ...HELP, label: 'How to start it →' } : undefined };
}

/**
 * A cameo: Nib's pose, one line in Nib's voice, then the plain sentence and its
 * actions. For empty states that no mascot state covers (`spy`, `squint`, `quiet`).
 * Never used in a Hold context.
 */
export function Cameo({
  pose,
  line,
  children,
  size = 120,
}: {
  pose: NibPose;
  /** Nib's line, 14 words or fewer, from the copy deck. */
  line: string;
  /** The plain sentence and any actions. */
  children?: ReactNode;
  size?: number;
}) {
  return (
    <div className="nib-state p-s4" data-cameo={pose}>
      <Nib pose={pose} size={size} />
      <div className="flex min-w-0 flex-col items-start gap-s2">
        <p className="nib-voice m-0 max-w-[34ch] text-fg">
          {line}
        </p>
        {children}
      </div>
    </div>
  );
}

export type LoadingKind = 'horizon' | 'lookout' | 'hold' | 'log';

/** After 600ms of waiting, a small spy and "Looking…". Earlier than that it would only flash. */
function LookingNib() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), 600);
    return () => clearTimeout(t);
  }, []);
  return (
    <div aria-hidden="true" data-looking={show ? 'on' : 'off'} className="pointer-events-none absolute right-s4 top-s3 flex items-center gap-s2 transition-opacity duration-ui" style={{ opacity: show ? 1 : 0 }}>
      <span className="text-body-s text-fg-mute">Looking…</span>
      <Nib pose="spy" size={40} />
    </div>
  );
}

/**
 * Route-level loading UI. Ruled skeletons at the real layout's heights so the
 * page does not jump when data arrives. No spinner and NO heading: the page's
 * own h1 appears with the page, so the raw HTML never carries two.
 */
export function PageLoading({ kind }: { kind: LoadingKind }) {
  return (
    <div role="status" aria-busy="true" className="relative">
      <span className="sr-only">Loading.</span>
      {kind === 'horizon' ? (
        <div className="grid grid-cols-12 gap-px overflow-hidden rounded-panel border border-rule bg-rule">
          <div className="col-span-12 flex flex-col gap-s4 bg-surface p-s4">
            <Skeleton className="h-10" width="55%" />
            <StatStrip
              srLabel="Counts"
              items={[
                { id: 'hold', label: 'Hold', value: null },
                { id: 'watch', label: 'Watch', value: null },
                { id: 'checked', label: 'Packages checked', value: null },
              ]}
            />
          </div>
          <div className="col-span-12 min-h-[20rem] bg-surface p-s4 lg:col-span-7">
            <SkeletonRows rows={4} rowHeight={72} label="Loading calls." />
          </div>
          <div className="col-span-12 min-h-[20rem] bg-surface p-s4 lg:col-span-5">
            <SkeletonRows rows={5} rowHeight={40} label="Loading chart." />
          </div>
        </div>
      ) : (
        <>
          <div className="py-s4">
            <Skeleton className="h-8" width="40%" />
          </div>
          <PanelGrid lines>
            <div className="col-span-12 min-h-[30rem] bg-surface p-s4">
              <SkeletonRows rows={kind === 'lookout' ? 8 : 10} rowHeight={40} label="Loading." />
            </div>
          </PanelGrid>
        </>
      )}
      <LookingNib />
    </div>
  );
}

/** A panel shell with a title and a ruled skeleton; used inside pages while their data loads. */
export function PanelLoading({ label, rows = 5, rowHeight = 40, className }: { label: string; rows?: number; rowHeight?: number; className?: string }) {
  return (
    <Panel label={label} className={className}>
      <SkeletonRows rows={rows} rowHeight={rowHeight} label={`Loading ${label.toLowerCase()}.`} />
    </Panel>
  );
}

/**
 * Route error boundary UI. A render error is a bug, not a backend outage:
 * say so in plain words and offer `Try again`. Data failures are handled
 * inside the pages with `DataError`. Illustrated with `oops`.
 */
export function PageError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="py-s4">
      <ErrorNib size={140} text="Something slipped on our side.">
        <p className="m-0 text-body text-fg">This page hit a problem and could not be shown.</p>
        <p className="m-0 text-body-s text-fg-soft">Try again. If it keeps happening, restart the dashboard.</p>
        <div className="mt-s2">
          <Button variant="tertiary" onClick={retry}>
            Try again
          </Button>
        </div>
      </ErrorNib>
    </div>
  );
}
