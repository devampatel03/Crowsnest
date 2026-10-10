/**
 * Scan lifecycle for the dialog. The backend emits four events (started,
 * ingestion_complete, complete, failed); the UI shows none of the phases, only
 * one of: nothing, "Checking your packages…", done, failed.
 */

export type ScanPhase = 'idle' | 'starting' | 'running' | 'complete' | 'failed';

export type ScanState = {
  phase: ScanPhase;
  path: string;
  scanId: string | null;
  /** Calls the finished scan reported. */
  found: number | null;
  /** Plain-words reason. Never raw backend text. */
  error: string | null;
};

export const INITIAL_SCAN: ScanState = { phase: 'idle', path: '', scanId: null, found: null, error: null };

export type ScanAction =
  | { type: 'submit'; path: string }
  | { type: 'accepted'; scanId: string }
  | { type: 'start-failed'; error: string }
  | { type: 'event'; scanId: string | null; phase: 'started' | 'ingestion_complete' | 'complete' | 'failed'; found?: number; error?: string }
  | { type: 'reset' };

const NO_FOLDER = "Crowsnest can't find that folder. If you use Docker, it can only see folders you share with it.";

/** Backend scan errors to one plain reason. Anything unrecognised becomes a generic line. */
export function plainScanReason(raw: string | undefined | null): string {
  if (raw && /no such|not found|does not exist|doesn't exist|not a directory|cannot find|can't find/i.test(raw)) return NO_FOLDER;
  return 'Check the folder and try again.';
}

export function scanReducer(s: ScanState, a: ScanAction): ScanState {
  switch (a.type) {
    case 'submit':
      return { ...INITIAL_SCAN, phase: 'starting', path: a.path };
    case 'accepted':
      return s.phase === 'starting' ? { ...s, phase: 'running', scanId: a.scanId } : s;
    case 'start-failed':
      return { ...s, phase: 'failed', error: a.error };
    case 'reset':
      return { ...INITIAL_SCAN, path: s.path };
    case 'event': {
      const active = s.phase === 'starting' || s.phase === 'running';
      // One scan per tab: ignore events of a different scan while ours is in flight.
      if (a.scanId && s.scanId && a.scanId !== s.scanId && active) return s;
      if (s.phase === 'idle' && a.phase !== 'started') return s;
      if (s.phase === 'starting' && !s.scanId && a.phase !== 'started') return s;
      const scanId = s.scanId ?? a.scanId;
      switch (a.phase) {
        case 'started':
        case 'ingestion_complete':
          return s.phase === 'complete' || s.phase === 'failed' ? s : { ...s, phase: 'running', scanId };
        case 'complete':
          return { ...s, phase: 'complete', scanId, found: a.found ?? 0 };
        case 'failed':
          return { ...s, phase: 'failed', scanId, error: plainScanReason(a.error) };
      }
    }
  }
}

/** `Done. 2 packages need your attention.` / `Done. Nothing needs your attention.` */
export function doneLine(found: number): string {
  if (found <= 0) return 'Done. Nothing needs your attention.';
  return found === 1 ? 'Done. 1 package needs your attention.' : `Done. ${found.toLocaleString('en-US')} packages need your attention.`;
}
