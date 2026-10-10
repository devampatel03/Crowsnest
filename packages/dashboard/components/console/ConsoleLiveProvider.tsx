'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useSWRConfig } from 'swr';
import { NibMini } from '@/components/mascot';
import { useToast } from '@/components/system';
import { API_URL, KEYS } from '@/lib/api';
import { headlineFor } from '@/lib/calls';
import { asScanPhase, backoffSeconds, MAX_FAILURES, staleSince, type ConnStatus } from '@/lib/live/machine';
import type { SecurityEvent } from '@/lib/types';

/** A real stream event, stamped with the browser's own clock so a skewed server clock cannot move it. */
export type LiveEvent = { type: string; receivedAt: number; severity?: string };
/** Only what the Heartbeat reads is kept: scan progress and incidents, last two minutes, at most 60. */
const KEEP_MS = 120_000;
const KEEP_MAX = 60;

export type LiveContextValue = {
  status: ConnStatus;
  /** Epoch ms of the last healthy contact, set when the stream drops. */
  lastSeenAt: number | null;
  /** `2:14 pm` once the stream has been down more than 10s, else null. Feeds every Stale tag. */
  stale: string | null;
  /** Real `scan_progress` and `incident_detected` events of the last two minutes, newest last. */
  events: LiveEvent[];
  /** Epoch ms of the latest real event, or null if none arrived since the page opened. */
  lastEventAt: number | null;
  subscribe: (fn: (e: SecurityEvent) => void) => () => void;
  reconnect: () => void;
};

const LiveContext = createContext<LiveContextValue | null>(null);

export function useConsoleLive(): LiveContextValue {
  const ctx = useContext(LiveContext);
  if (!ctx) throw new Error('useConsoleLive must be used inside <ConsoleLiveProvider>');
  return ctx;
}

/**
 * One EventSource for all four pages. The stream is a hint to refetch, never
 * the source of truth: every incident or finished scan refreshes the shared SWR
 * keys, and polling is the floor. Only three event types matter here
 * (`incident_detected`, `scan_progress`, `connected`); everything else on the
 * stream is ignored. The retry timer is internal: no countdown is ever shown.
 */
export function ConsoleLiveProvider({ children }: { children: ReactNode }) {
  const { mutate } = useSWRConfig();
  const { toast } = useToast();
  const router = useRouter();

  const [status, setStatus] = useState<ConnStatus>('connecting');
  const [lastSeenAt, setLastSeenAt] = useState<number | null>(null);
  const [disconnectedAt, setDisconnectedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [announcement, setAnnouncement] = useState('');
  const [events, setEvents] = useState<LiveEvent[]>([]);

  const listeners = useRef(new Set<(e: SecurityEvent) => void>());
  const esRef = useRef<EventSource | null>(null);
  const failures = useRef(0);
  const lastSeen = useRef<number | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasDown = useRef(false);
  const connectRef = useRef<() => void>(() => {});
  const alive = useRef(true);
  const routerRef = useRef(router);
  const toastRef = useRef(toast);
  useEffect(() => {
    routerRef.current = router;
    toastRef.current = toast;
  }, [router, toast]);

  const clearTimer = useCallback(() => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retryTimer.current = null;
  }, []);

  const refreshAll = useCallback(() => {
    Object.values(KEYS).forEach((k) => void mutate(k));
  }, [mutate]);

  const handle = useCallback(
    (ev: SecurityEvent) => {
      lastSeen.current = Date.now();
      if (ev.type === 'scan_progress' || ev.type === 'incident_detected') {
        const at = Date.now();
        setEvents((cur) => [...cur.filter((e) => at - e.receivedAt < KEEP_MS), { type: ev.type, receivedAt: at, severity: ev.severity }].slice(-KEEP_MAX));
      }
      if (ev.type === 'scan_progress' && asScanPhase(ev.phase) === 'complete') refreshAll();
      if (ev.type === 'incident_detected') {
        void mutate(KEYS.incidents);
        void mutate(KEYS.stats);
        const headline = headlineFor(ev.attack_pattern ?? '');
        setAnnouncement(`New call: ${headline}`);
        if (ev.severity === 'HIGH' || ev.severity === 'CRITICAL') {
          const id = ev.id;
          toastRef.current({
            tone: 'hold',
            id: id ? `hold-${id}` : undefined,
            message: `New Hold: ${headline}`,
            action: id ? { label: 'View →', onSelect: () => routerRef.current.push(`/horizon?focus=${encodeURIComponent(id)}`) } : undefined,
          });
        }
      }
      listeners.current.forEach((fn) => fn(ev));
    },
    [mutate, refreshAll],
  );

  const connect = useCallback(() => {
    esRef.current?.close();
    clearTimer();
    if (typeof EventSource === 'undefined') return;
    const es = new EventSource(`${API_URL}/api/events`);
    esRef.current = es;
    es.onopen = () => {
      failures.current = 0;
      lastSeen.current = Date.now();
      setStatus('live');
      setDisconnectedAt(null);
      if (wasDown.current) {
        wasDown.current = false;
        toastRef.current({ message: "Back online. Lantern's lit.", tone: 'success', id: 'conn', icon: <NibMini size={20} /> });
        refreshAll();
      }
    };
    es.onmessage = (m: MessageEvent<string>) => {
      try {
        const parsed: unknown = JSON.parse(m.data);
        if (parsed && typeof parsed === 'object') handle(parsed as SecurityEvent);
      } catch {
        /* ignore malformed events */
      }
    };
    es.onerror = () => {
      es.close();
      if (esRef.current === es) esRef.current = null;
      if (!alive.current) return;
      failures.current += 1;
      setDisconnectedAt((cur) => cur ?? Date.now());
      setLastSeenAt((cur) => lastSeen.current ?? cur);
      wasDown.current = true;
      if (failures.current >= MAX_FAILURES) {
        setStatus('offline');
        return;
      }
      setStatus('reconnecting');
      retryTimer.current = setTimeout(() => connectRef.current(), backoffSeconds(failures.current) * 1000);
    };
  }, [clearTimer, handle, refreshAll]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const reconnect = useCallback(() => {
    failures.current = 0;
    setStatus('connecting');
    connect();
  }, [connect]);

  useEffect(() => {
    alive.current = true;
    connect();
    const online = () => reconnect();
    window.addEventListener('online', online);
    return () => {
      alive.current = false;
      window.removeEventListener('online', online);
      esRef.current?.close();
      clearTimer();
    };
  }, [connect, reconnect, clearTimer]);

  // A once-a-second tick only while the stream is down, so the Stale tag appears at 10s.
  useEffect(() => {
    if (status !== 'reconnecting' && status !== 'offline') return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [status]);

  const subscribe = useCallback((fn: (e: SecurityEvent) => void) => {
    listeners.current.add(fn);
    return () => {
      listeners.current.delete(fn);
    };
  }, []);

  const stale = staleSince(status, lastSeenAt, disconnectedAt, now);

  const lastEventAt = events.length > 0 ? events[events.length - 1].receivedAt : null;
  const value = useMemo<LiveContextValue>(
    () => ({ status, lastSeenAt, stale, events, lastEventAt, subscribe, reconnect }),
    [status, lastSeenAt, stale, events, lastEventAt, subscribe, reconnect],
  );

  return (
    <LiveContext.Provider value={value}>
      {children}
      <div role="status" className="sr-only">
        {announcement}
      </div>
    </LiveContext.Provider>
  );
}
