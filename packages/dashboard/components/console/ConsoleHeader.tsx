'use client';

import { useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { Heartbeat } from '@/components/charts/Heartbeat';
import { Button, IconButton, Tooltip } from '@/components/system';
import { cn } from '@/lib/format';
import { statusText, type LiveStatus } from '@/lib/live/machine';
import { isoTitle } from '@/lib/time';
import { useConsoleLive } from './ConsoleLiveProvider';
import { pageFor } from './Rail';
import { useScan } from './ScanProvider';
import { useShortcutContext } from './ShortcutProvider';

const SHORT: Record<LiveStatus, string> = {
  connecting: 'Connecting',
  live: 'Live',
  scanning: 'Scanning',
  reconnecting: 'Reconnecting',
  offline: 'Offline',
};

/** The composed status: scanning rides on top of a live stream only. */
export function useLiveStatus(): { status: LiveStatus; text: string; title: string | undefined } {
  const live = useConsoleLive();
  const scan = useScan();
  const status: LiveStatus = live.status === 'live' && scan.scanning ? 'scanning' : live.status;
  return {
    status,
    text: statusText(status, live.lastSeenAt, live.lastEventAt),
    title: status === 'offline' && live.lastSeenAt ? `Last data ${isoTitle(live.lastSeenAt)}` : undefined,
  };
}

const noop = () => () => {};
/** False on the server and during hydration, true after: for pieces whose markup holds generated ids. */
function useHydrated(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}

/**
 * 56px header: the page name, the Heartbeat (real stream events of the last
 * minute; flat when nothing happened; hidden under 768px (this project has no sm breakpoint)), ONE status string
 * (the only clock on the screen), the one Primary, and refresh. The status node
 * is the only live region for connection state.
 */
export function ConsoleHeader() {
  const pathname = usePathname();
  const live = useConsoleLive();
  const scan = useScan();
  const { refresh } = useShortcutContext();
  const { status, text, title } = useLiveStatus();
  const page = pageFor(pathname);
  const hydrated = useHydrated();

  return (
    <header className="sticky top-0 z-20 flex h-console-header items-center gap-s4 border-b border-rule bg-surface px-s3 md:px-s5">
      <p className="m-0 shrink-0 font-sans text-[1.25rem] font-semibold leading-none text-fg">{page?.name ?? 'Crowsnest'}</p>
      <div className="ml-auto h-7 w-[10rem] shrink-0 max-md:hidden" data-heartbeat-slot>
        {hydrated ? <Heartbeat events={live.events} live={live.status === 'live'} /> : null}
      </div>
      <p
        role="status"
        title={title}
        data-live-status={status}
        className={cn(
          'm-0 min-w-0 text-right max-md:ml-auto text-body-s leading-tight md:truncate',
          status === 'offline' || status === 'reconnecting' ? 'text-fg' : 'text-fg-soft',
        )}
      >
        <span className="max-md:sr-only">{text}</span>
        <span aria-hidden="true" className="md:hidden">
          {SHORT[status]}
        </span>
      </p>
      <div className="flex shrink-0 items-center gap-s3">
        <Button onClick={scan.openDialog} aria-keyshortcuts="s" className="max-md:px-s3">
          <span className="max-md:hidden">Scan a project</span>
          <span className="md:hidden">Scan</span>
        </Button>
        <Tooltip content="Refresh (r)" side="bottom">
          <IconButton label="Refresh" icon={RefreshCw} onClick={refresh} aria-keyshortcuts="r" />
        </Tooltip>
      </div>
    </header>
  );
}
