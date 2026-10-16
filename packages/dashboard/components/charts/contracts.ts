/**
 * Prop contracts for the three charts. Charts take plain data (no SWR, no
 * fetch, no context, no SSE). The the console owns loading, the live buffer
 * and the surrounding Panel (which prints the panel title); a chart owns its
 * states: loading, error, empty, data.
 *
 * Numeric API fields can arrive as strings ("1.00"). Every field that is numeric
 * is typed `Numeric` here and coerced inside the transforms, so callers can pass
 * the payload as it came.
 */
import type { ReactNode } from 'react';

export type Numeric = number | string;

export interface ChartError {
  /** One plain sentence: `We couldn't reach Crowsnest at http://localhost:8000. Is it running?` */
  what: string;
  /** Optional second line. */
  next?: string;
  /** Optional help link, e.g. `{ href: '/docs/troubleshooting', label: 'How to start it →' }`. */
  help?: { href: string; label: string };
}

export interface ChartStateProps {
  /** First load, no data yet: ruled skeleton and an sr-only status. */
  loading?: boolean;
  /** Plain error state. Takes precedence over loading and data. */
  error?: ChartError | null;
  /** Renders `Try again →` in the error state. */
  onRetry?: () => void;
  /** Overrides the default empty sentence. */
  emptyText?: ReactNode;
  className?: string;
}

/** The subset of Incident the chart reads. A full Incident satisfies it. */
export interface DailyCallIncident {
  /** `LOW | MEDIUM | HIGH | CRITICAL` (anything else counts as a note). */
  severity: string;
  /** ISO timestamp. Unparseable values are ignored. */
  detected_at: string;
}

export interface DailyCallsProps extends ChartStateProps {
  /**
   * Pass ALL incidents you have, not only the in-window ones: older ones let the
   * empty state say `Latest: 31 May 2026.`
   */
  incidents: DailyCallIncident[];
  /** Window length in days, ending today. Default 30. The empty text, the label and the table follow it. */
  days?: number;
  /** Fixed clock for tests; default Date.now() read once per mount. */
  now?: number;
  /** Bucket days in UTC instead of the viewer's local time. Default false (local). */
  utc?: boolean;
  /** Plot height in px (also the ResponsiveContainer min height). Default 200 (wave) or 48 (spark). */
  height?: number;
  /** `wave` (default): two series, grid, axis, direct labels. `spark`: one axis-free line for the Log page, no table toggle. */
  variant?: 'wave' | 'spark';
  /**
   * Live head state. true (default): ripple ring. false (stream offline): static hollow ring.
   * Reduced motion always gets the static ring.
   */
  live?: boolean;
  /** Empty state only: a node placed beside the plain sentence, e.g. `<EmptyNib />`. Charts do not import the mascot for it. */
  emptyAdornment?: ReactNode;
}

/** The subset of MaintainerScore the ranking reads. A full MaintainerScore satisfies it. */
export interface RankingMaintainer {
  login: string;
  /** 0 to 1; may be a string. */
  risk_score: Numeric;
  /** `ioc_flagged`: linked to known harmful activity. Shown as a Hold gauge plus the word Flagged. */
  ioc_flagged: boolean;
  packages_in_graph?: Numeric;
  commits_90d?: Numeric;
}

export interface RiskRankingProps extends ChartStateProps {
  maintainers: RankingMaintainer[];
  /** Login of the selected person (controlled). */
  selectedLogin?: string | null;
  /** Called with the login, or null to clear. Enter / Space / click toggles; Escape clears. */
  onSelect?: (login: string | null) => void;
  /** Rows before `Show all`. Default 10. */
  limit?: number;
  /** The backend fetches at most this many; when the list is that long a note says so. Default 100. */
  cap?: number;
}

export interface EcosystemCount {
  ecosystem: string;
  count: Numeric;
}

export interface EcosystemBarProps extends ChartStateProps {
  /** Either pre-counted... */
  counts?: EcosystemCount[];
  /** ...or raw rows (counted internally; pass the FILTERED set). */
  rows?: { ecosystem: string }[];
}

import type { HeartbeatEvent } from './transforms';
export type { HeartbeatEvent };

export interface HeartbeatProps {
  /**
   * The console's recent stream events, newest last. Pass the raw buffer; the
   * chart keeps only `scan_progress` and `incident_detected` from the last 60
   * seconds and ignores everything else (publish_event, connected). Stamp
   * `receivedAt: Date.now()` when each arrives so a skewed server clock cannot
   * push events out of the window.
   */
  events: HeartbeatEvent[];
  /** Stream connected. false: dashed muted line and a hollow head (the console prints the Offline sentence). */
  live?: boolean;
  /** Fixed clock for tests; otherwise a 1s tick while the tab is visible. */
  now?: number;
  width?: number;
  height?: number;
  className?: string;
}
