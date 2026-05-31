/**
 * src/types.ts
 *
 * All shared TypeScript interfaces for the Crowsnest Slack bot.
 * Mirrors the data shapes that the Crowsnest API returns.
 */

// ---------------------------------------------------------------------------
// Core domain types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// API response shapes
// ---------------------------------------------------------------------------

/** Returned from /api/scan (initiation) */
export interface ScanInitResponse {
  id: string;
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

/** Returned from /api/investigate */
export interface InvestigationResult {
  package: string;
  incident: Incident | null;
  analysis: {
    maintainer_changes: number;
    days_since_maintainer_change: number | null;
    commit_pattern_anomaly: boolean;
    slsa_attestation: boolean;
    slsa_pipeline_risk: boolean;
    socket_alerts: number;
    weekly_downloads: number;
    age_days: number;
  };
  verdict: 'clean' | 'suspicious' | 'compromised';
  summary: string;
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

// ---------------------------------------------------------------------------
// SSE event types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Slack block kit convenience alias
// Using Record<string, unknown> keeps us compatible with any @slack/bolt version
// ---------------------------------------------------------------------------
export type Block = Record<string, unknown>;
