'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { fetchIncidents, fetchLockfiles, fetchMaintainerReputation, fetchStats, KEYS } from '@/lib/api';
import { clockTime } from '@/lib/time';
import type { Incident, LockfileEntry, MaintainerScore, StatsResult } from '@/lib/types';
import { useConsoleLive } from './ConsoleLiveProvider';

export type ConsoleData<T> = {
  data: T | undefined;
  error: unknown;
  /** First load only: no cached data yet. */
  loading: boolean;
  retry: () => void;
  /** `2:14 pm` of the last good response when data is shown but the latest poll failed. */
  pollStale: string | null;
};

function useConsoleData<T>(key: string, fetcher: () => Promise<T>, refreshInterval: number): ConsoleData<T> {
  const lastOk = useRef<number | null>(null);
  const { data, error, isLoading, mutate } = useSWR<T>(key, fetcher, {
    refreshInterval,
    // SWR pauses polling while the tab is hidden (refreshWhenHidden defaults to false).
    onSuccess: () => {
      lastOk.current = Date.now();
    },
    shouldRetryOnError: false,
  });
  const retry = useCallback(() => void mutate(), [mutate]);
  return {
    data,
    error,
    loading: isLoading && data === undefined,
    retry,
    // eslint-disable-next-line react-hooks/refs -- read-only timestamp for display
    pollStale: error && data !== undefined && lastOk.current ? clockTime(lastOk.current) : null,
  };
}

/** One request shared by Horizon, Hold (status) and Log. 30s poll plus stream-triggered refetch. */
export const useIncidents = (): ConsoleData<Incident[]> => useConsoleData(KEYS.incidents, () => fetchIncidents(), 30_000);
export const useStats = (): ConsoleData<StatsResult> => useConsoleData(KEYS.stats, fetchStats, 30_000);
export const useMaintainers = (): ConsoleData<MaintainerScore[]> => useConsoleData(KEYS.maintainers, fetchMaintainerReputation, 60_000);
/** Hold fetches every ecosystem once; the ecosystem control filters client-side so counts stay honest. */
export const useLockfiles = (): ConsoleData<LockfileEntry[]> => useConsoleData(KEYS.lockfiles, () => fetchLockfiles(), 120_000);

/** The Stale tag for a panel: stream down more than 10s, else a failed poll. */
export function useStaleMarker(...sources: ConsoleData<unknown>[]): string | null {
  const live = useConsoleLive();
  return live.stale ?? sources.find((s) => s.pollStale)?.pollStale ?? null;
}

/** Epoch ms for relative times; refreshed once a minute (never per second: no live-ticking numbers). */
export function useNow(everyMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}
