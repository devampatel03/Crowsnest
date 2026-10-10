'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useSWRConfig } from 'swr';
import { Nib, NibMini } from '@/components/mascot';
import { useToast } from '@/components/system';
import { describeError, fetchScanStatus, isUnreachable, KEYS, triggerScan } from '@/lib/api';
import { asScanPhase } from '@/lib/live/machine';
import { INITIAL_SCAN, plainScanReason, scanReducer, type ScanState } from '@/lib/live/scan';
import { useConsoleLive } from './ConsoleLiveProvider';

export type ScanContextValue = {
  state: ScanState;
  /** True from the moment the user presses Scan until the scan ends. */
  scanning: boolean;
  dialogOpen: boolean;
  openDialog: () => void;
  closeDialog: () => void;
  start: (path: string) => Promise<void>;
  /** Back to the form with the folder kept. */
  retry: () => void;
};

const ScanContext = createContext<ScanContextValue | null>(null);

export function useScan(): ScanContextValue {
  const ctx = useContext(ScanContext);
  if (!ctx) throw new Error('useScan must be used inside <ScanProvider>');
  return ctx;
}

export function ScanProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(scanReducer, INITIAL_SCAN);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { status, subscribe } = useConsoleLive();
  const { toast } = useToast();
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const stateRef = useRef(state);
  const dialogRef = useRef(false);
  useEffect(() => {
    stateRef.current = state;
    dialogRef.current = dialogOpen;
  }, [state, dialogOpen]);
  const refreshedFor = useRef<string | null>(null);

  // Stream events feed the reducer.
  useEffect(
    () =>
      subscribe((ev) => {
        if (ev.type !== 'scan_progress') return;
        const phase = asScanPhase(ev.phase);
        if (!phase) return;
        dispatch({ type: 'event', scanId: ev.scan_id ?? null, phase, found: ev.incidents_found, error: ev.error });
      }),
    [subscribe],
  );

  // While the stream is down, follow the scan by polling its status every 2s.
  const followingByPoll = state.phase === 'running' && !!state.scanId && (status === 'reconnecting' || status === 'offline');
  useEffect(() => {
    if (!followingByPoll || !state.scanId) return;
    const id = state.scanId;
    let stop = false;
    const tick = async () => {
      try {
        const s = await fetchScanStatus(id);
        if (stop) return;
        if (s.status === 'complete') dispatch({ type: 'event', scanId: id, phase: 'complete', found: s.incidents.length });
        else if (s.status === 'failed') dispatch({ type: 'event', scanId: id, phase: 'failed', error: s.error });
      } catch {
        /* keep polling; the stream or the API will come back */
      }
    };
    const t = setInterval(() => void tick(), 2000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [followingByPoll, state.scanId]);

  // Refetch once per finished scan.
  useEffect(() => {
    if (state.phase !== 'complete') return;
    const key = state.scanId ?? 'none';
    if (refreshedFor.current === key) return;
    refreshedFor.current = key;
    Object.values(KEYS).forEach((k) => void mutate(k));
    // The dialog already says the result when it is open; the toast is for someone who looked away.
    if (!dialogRef.current) {
      const found = state.found ?? 0;
      if (found > 0) {
        toast({
          message: `Scan finished. ${found.toLocaleString('en-US')} ${found === 1 ? 'package needs' : 'packages need'} your attention.`,
          id: 'scan',
          action: { label: 'View →', onSelect: () => router.push('/horizon') },
        });
      } else {
        toast({ message: "Done. Nib's back with the results.", tone: 'success', id: 'scan', icon: <NibMini size={20} /> });
      }
    }
  }, [state.phase, state.scanId, state.found, mutate, toast, router]);

  const start = useCallback(
    async (path: string) => {
      const cur = stateRef.current;
      if (cur.phase === 'starting' || cur.phase === 'running') return;
      dispatch({ type: 'submit', path });
      try {
        const res = await triggerScan(path);
        dispatch({ type: 'accepted', scanId: res.scan_id });
        toast({ message: 'Scan started.', id: 'scan', icon: <NibMini size={20} /> });
      } catch (e) {
        toast({ message: "Couldn't start the scan. Is Crowsnest running?", tone: 'error', id: 'scan', icon: <Nib pose="oops" size={28} /> });
        dispatch({ type: 'start-failed', error: isUnreachable(e) ? describeError(e) : plainScanReason(e instanceof Error ? e.message : '') });
      }
    },
    [toast],
  );

  const openDialog = useCallback(() => setDialogOpen(true), []);
  const closeDialog = useCallback(() => setDialogOpen(false), []);
  const retry = useCallback(() => dispatch({ type: 'reset' }), []);

  const scanning = state.phase === 'starting' || state.phase === 'running';
  const value = useMemo<ScanContextValue>(
    () => ({ state, scanning, dialogOpen, openDialog, closeDialog, start, retry }),
    [state, scanning, dialogOpen, openDialog, closeDialog, start, retry],
  );
  return <ScanContext.Provider value={value}>{children}</ScanContext.Provider>;
}
