/**
 * All shared TypeScript interfaces for the Crowsnest Slack bot.
 * Mirrors the data shapes that the Crowsnest API returns.
 */

/** Severity levels matching the Crowsnest API */
export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

/** All known attack patterns in the Crowsnest taxonomy */
export type AttackPattern =
  | 'maintainer_takeover'
  | 'worm'
  | 'slopsquat'
  | 'slsa_poisoning'
  | 'sleeper'
  | 'identity_drift'
  | 'typosquat'
  | 'dep_confusion';

/** A remediation option for an incident */
export interface RemediationOption {
  action: string;         // e.g. "pin version", "replace package", "audit lockfile"
  description: string;
  reversibility: 'easy' | 'moderate' | 'hard';
  pr_ready?: boolean;     // Whether Crowsnest can auto-generate a PR
}

/** A single detected security incident */
export interface Incident {
  id: string;
  attack_pattern: AttackPattern;
  confidence: number;             // 0.0 – 1.0
  severity: Severity;
  packages: string[];             // Affected package names
  blast_radius: number;           // Number of affected internal projects/services
  runtime_confirmation: boolean;  // Was the package observed at runtime?
  remediation_options: Array<RemediationOption | string>;  // API returns plain strings
  detected_at: string;            // ISO 8601 timestamp
  description?: string;           // Optional human-readable description
  maintainer?: string;            // Implicated maintainer login if relevant
  affected_versions?: string[];   // Version range strings
}

/** Returned from /api/scan (initiation) */
export interface ScanInitResponse {
  /** The backend returns `scan_id`; `id` is accepted for older servers. */
  scan_id?: string;
  id?: string;
  status: 'pending' | 'running' | 'complete' | 'failed';
  message?: string;
}

/** Polled from /api/scan/{id}/status */
export interface ScanStatusResponse {
  id: string;
  status: 'pending' | 'running' | 'complete' | 'failed';
  progress?: number;          // 0–100
  incidents?: Incident[];
  error?: string;
}

/** Final result returned once a scan is complete */
export interface ScanResult {
  scan_id: string;
  project_path: string;
  status: 'complete' | 'failed';
  incidents: Incident[];
  packages_scanned: number;
  duration_ms: number;
  scanned_at: string;
}

/** Returned from /api/blast-radius */
export interface BlastRadiusResult {
  maintainer: string;
  compromised_packages: string[];
  affected_projects: string[];
  affected_packages: string[];
  total_affected: number;
  runtime_exposed: boolean;
  risk_score: number;   // 0.0 – 1.0
}

/** Returned from /api/investigate: the install check's answer plus the package facts the backend holds. */
export interface InvestigationResult {
  package: string;
  /** Hold when the install check blocks it, Watch when it raised anything, Clear only when nothing went unchecked. */
  call: 'Hold' | 'Watch' | 'Clear' | 'Not fully checked';
  /** 0.0 to 1.0, the same risk the install check acts on. */
  risk: number;
  signals: string[];
  /** Checks that could not be made, so a Clear is never claimed over a gap. */
  not_checked: string[];
  weekly_downloads: number | null;
  age_days: number | null;
  maintainers: string[];
  socket_alerts: number;
}

/** Returned from /api/stats */
export interface StatsResult {
  total_packages: number;
  total_maintainers: number;
  active_incidents: {
    CRITICAL: number;
    HIGH: number;
    MEDIUM: number;
    LOW: number;
  };
  last_scan_at: string | null;
  last_scan_project: string | null;
}

/** Envelope for all SSE events from /api/events */
export interface PublishEvent {
  type: 'incident_detected' | 'scan_started' | 'scan_complete' | 'heartbeat';
  payload: unknown;
  timestamp: string;
}

/** Narrowed event type for incident alerts */
export interface IncidentEvent extends PublishEvent {
  type: 'incident_detected';
  payload: Incident;
}

// Block Kit blocks, typed from chat.postMessage itself. A plain Record<string, unknown> does not satisfy its
// `(Block | KnownBlock)[]` parameter, and deriving the type from `App` keeps it in step with the WebClient version
// that @slack/bolt bundles.
import type { App as _SlackApp } from '@slack/bolt';
type SlackChatPostMessageArgs = NonNullable<Parameters<_SlackApp['client']['chat']['postMessage']>[0]>;
export type Block = NonNullable<SlackChatPostMessageArgs['blocks']>[number];
