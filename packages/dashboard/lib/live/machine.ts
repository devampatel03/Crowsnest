import { clockTime } from '@/lib/time';

/** Connection state of the single console EventSource. `scanning` is layered on top of `live`. */
export type ConnStatus = 'connecting' | 'live' | 'reconnecting' | 'offline';
export type LiveStatus = ConnStatus | 'scanning';

/** Five consecutive failures (1+2+4+8+16 = 31s) and the stream is `offline`. */
export const MAX_FAILURES = 5;
/** Data is marked Stale once the stream has been down this long. */
export const STALE_AFTER_MS = 10_000;

/** Backoff after the nth consecutive failure (1-based): 1, 2, 4, 8, 16 seconds. */
export function backoffSeconds(failures: number): number {
  return Math.min(2 ** Math.max(0, failures - 1), 16);
}

/**
 * The ONE status string. There is no countdown anywhere in the
 * UI: the retry timer is internal to the provider, so two clocks cannot
 * disagree. The absolute time for the offline line goes in a `title`.
 */
export function statusText(status: LiveStatus, lastSeenAt: number | null, lastEventAt: number | null = null): string {
  switch (status) {
    case 'connecting':
      return 'Connecting…';
    case 'live':
      return lastEventAt ? `Live. Last event ${clockTime(lastEventAt)}.` : 'Live. Nothing new.';
    case 'scanning':
      return 'Checking your packages…';
    case 'reconnecting':
      return 'Reconnecting…';
    case 'offline':
      return lastSeenAt ? `Offline. Showing data from ${clockTime(lastSeenAt)}.` : 'Offline.';
  }
}

/** `2:14 pm` of the last good contact once the stream has been down more than 10s, else null. Feeds every Stale tag. */
export function staleSince(status: ConnStatus, lastSeenAt: number | null, disconnectedAt: number | null, now: number): string | null {
  if (status !== 'reconnecting' && status !== 'offline') return null;
  if (disconnectedAt === null || now - disconnectedAt < STALE_AFTER_MS) return null;
  return clockTime(lastSeenAt ?? disconnectedAt) || null;
}

export type ScanPhaseEvent = 'started' | 'ingestion_complete' | 'complete' | 'failed';

export function asScanPhase(p: string | undefined): ScanPhaseEvent | null {
  return p === 'started' || p === 'ingestion_complete' || p === 'complete' || p === 'failed' ? p : null;
}
