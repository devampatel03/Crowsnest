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
  | 'abandoned_popular';

export interface BlastRadiusEntry {
  project_path: string;
  package: string;
  version: string;
  declared_in: string;
  runtime_confirmed: boolean;
}

export interface Incident {
  id: string;
  attack_pattern: AttackPattern;
  confidence: number;
  severity: Severity;
  packages: string[];
  blast_radius: BlastRadiusEntry[];
  runtime_confirmation: boolean;
  remediation_options: string[];
  detected_at: string;
  raw_findings: Record<string, unknown>[];
}

export interface SecurityEvent {
  type: 'publish_event' | 'incident_detected' | 'scan_progress' | 'firehose' | 'connected';
  timestamp: string;
  data?: Record<string, unknown>;
  package?: string;
  version?: string;
  probability?: number;
  severity?: Severity;
  attack_pattern?: AttackPattern;
  packages?: string[];
  scan_id?: string;
  phase?: string;
  incidents_found?: number;
  token_usage?: number;
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
  token_usage: number;
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
  snapshots: Array<{ name: string; created_at: string | null }>;
}
