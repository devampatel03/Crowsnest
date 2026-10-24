export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type AttackPattern =
  | 'maintainer_takeover'
  | 'worm'
  | 'slopsquat'
  | 'slsa_poisoning'
  | 'sleeper'
  | 'identity_drift'
  | 'typosquat'
  | 'dep_confusion'
  | 'ioc_match'
  | 'ci_cache_poisoning'
  | 'oidc_misuse'
  | 'abandoned_popular'
  | 'release_anomaly';

/**
 * Every type below describes the NORMALISED shape: what `lib/api.ts` hands to
 * the UI after coercing numeric strings and defaulting missing fields. The raw
 * wire shape is never typed, so a render path cannot depend on it.
 */

export interface BlastRadiusEntry {
  project_path: string;
  package: string;
  version: string;
  declared_in: string;
  runtime_confirmed: boolean;
  compromised_root?: string;
  parent_chain?: string[];
  last_runtime_load?: string | null;
}

export interface Incident {
  id: string;
  /** Unknown keys from a newer backend are kept as strings; calls.ts has a fallback headline. */
  attack_pattern: AttackPattern | (string & {});
  confidence: number;
  severity: Severity;
  packages: string[];
  blast_radius: BlastRadiusEntry[];
  runtime_confirmation: boolean;
  remediation_options: string[];
  /** ISO string; '' when the backend sent nothing parseable. */
  detected_at: string;
  raw_findings: Record<string, unknown>[];
}

/** An event on /api/events. Only the fields the console reads are typed. */
export interface SecurityEvent {
  type: string;
  timestamp: string;
  id?: string;
  severity?: Severity;
  attack_pattern?: string;
  packages?: string[];
  scan_id?: string;
  phase?: string;
  incidents_found?: number;
  error?: string;
}

export interface MaintainerScore {
  login: string;
  packages_in_graph: number;
  commits_90d: number;
  gpg_sign_ratio: number;
  repos_touched: number;
  days_on_platform: number;
  ioc_flagged: boolean;
  /** Always a finite number from 0 to 1 (the wire sends "1.00"). */
  risk_score: number;
}

export interface LockfileEntry {
  project_path: string;
  ecosystem: string;
  package: string;
  version: string;
  integrity_hash: string;
  resolved_url: string;
  declared_in: string;
  parent_chain: string[];
}

export interface ScanStatus {
  id: string;
  status: 'pending' | 'running' | 'complete' | 'failed';
  started_at: string;
  finished_at?: string;
  project_path: string;
  incidents: Incident[];
  error?: string;
}

export interface BlastRadiusResult {
  maintainer: string;
  packages_controlled: string[];
  affected_projects: string[];
  total_affected_deps: number;
  blast_radius_entries: BlastRadiusEntry[];
  runtime_confirmed_count: number;
}

export interface StatsResult {
  table_counts: Record<string, number>;
  total_incidents: number;
  active_scans: number;
  total_packages: number | null;
  total_maintainers: number | null;
  active_incidents: Record<Severity, number>;
  last_scan_at: string | null;
  last_scan_project: string | null;
}

export interface VetoResult {
  blocked: boolean;
  package: string;
  version: string | null;
  /** 0 to 1. */
  probability: number;
  signals: string[];
  reason: string;
  override_flag: string | null;
}
