/**
 * Crowsnest API client — talks to the Python FastAPI backend.
 */

import { getConfig } from './config.js';

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

export interface Incident {
  id: string;
  attack_pattern: string;
  confidence: number;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  packages: string[];
  blast_radius: BlastRadiusEntry[];
  runtime_confirmation: boolean;
  remediation_options: string[];
  detected_at: string;
}

export interface BlastRadiusEntry {
  project_path: string;
  package: string;
  version: string;
  declared_in: string;
  runtime_confirmed: boolean;
}

export interface BlastRadiusResult {
  maintainer: string;
  packages_controlled: string[];
  affected_projects: string[];
  total_affected_deps: number;
  blast_radius_entries: BlastRadiusEntry[];
  runtime_confirmed_count: number;
}

export interface ReplayResult {
  ioc_name: string;
  snapshot_used: string | null;
  ioc_records: unknown[];
  affected_lockfile_entries: unknown[];
  summary: {
    total_iocs: number;
    affected_packages: number;
    your_exposed_packages: number;
  };
}

export interface VetoResult {
  blocked: boolean;
  package: string;
  version: string | null;
  probability: number;
  signals: string[];
  reason: string;
  override_flag: string | null;
  /** Lookups that could not be made. They are never a clean result. */
  degraded: string[];
  release_age_hours: number | null;
  ecosystem?: string;
}

export interface ChangeResult extends VetoResult {
  change: 'added' | 'updated';
  previous_versions: string[];
}

export interface ChangeReport {
  base_ref: string | null;
  project_path: string;
  checked: number;
  unchanged: number;
  blocked: ChangeResult[];
  degraded: string[];
  results: ChangeResult[];
}

export interface MaintainerScore {
  login: string;
  packages_in_graph: number;
  commits_90d: number;
  gpg_sign_ratio: number;
  days_on_platform: number;
  ioc_flagged: boolean;
  risk_score: number;
}

export interface LockfileEntry {
  project_path: string;
  ecosystem: string;
  package: string;
  version: string;
  declared_in: string;
}

class APIError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'APIError';
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const { apiUrl } = getConfig();
  const url = `${apiUrl}${path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
  } catch (err) {
    throw new APIError(
      `Crowsnest is not running (nothing answered at ${apiUrl}).\n` +
      `Start it with:  crowsnest start      (needs Docker)\n` +
      `Already running it somewhere else?  crowsnest config set apiUrl <address>\n` +
      `Not sure what is wrong?  crowsnest doctor\n` +
      `Error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new APIError(`API error ${response.status}: ${body}`, response.status);
  }

  return response.json() as Promise<T>;
}

export interface Health {
  status: string;
  version: string;
  /** Where the backend sees the folder shared from the user's machine, when it runs in Docker. */
  projects_root?: string | null;
}

export const api = {
  async health(): Promise<Health> {
    return request('/health', { signal: AbortSignal.timeout(3000) });
  },

  async scan(options: { projectPath: string; ecosystem?: string; lockfilePath?: string; githubOrg?: string }): Promise<{ scan_id: string }> {
    return request('/api/scan', {
      method: 'POST',
      body: JSON.stringify({
        project_path: options.projectPath,
        ecosystem: options.ecosystem || 'npm',
        lockfile_path: options.lockfilePath,
        github_org: options.githubOrg,
      }),
    });
  },

  async getScanStatus(scanId: string): Promise<ScanStatus> {
    return request(`/api/scan/${scanId}/status`);
  },

  async investigate(pkg: string, version: string | null, ecosystem: string): Promise<Record<string, unknown>> {
    return request('/api/investigate', {
      method: 'POST',
      body: JSON.stringify({ package: pkg, version, ecosystem }),
    });
  },

  async blastRadius(maintainer: string, ecosystem = 'npm'): Promise<BlastRadiusResult> {
    return request('/api/blast-radius', {
      method: 'POST',
      body: JSON.stringify({ maintainer, ecosystem }),
    });
  },

  async replay(iocName: string, snapshotDate?: string): Promise<ReplayResult> {
    return request('/api/replay', {
      method: 'POST',
      body: JSON.stringify({ ioc_name: iocName, snapshot_date: snapshotDate }),
    });
  },

  async vetoCheck(
    pkg: string,
    version?: string,
    ecosystem = 'npm',
    minReleaseAgeDays?: number,
  ): Promise<VetoResult> {
    return request('/api/veto', {
      method: 'POST',
      body: JSON.stringify({
        package: pkg,
        version: version || null,
        ecosystem,
        min_release_age_days: minReleaseAgeDays ?? null,
      }),
    });
  },

  async checkChanges(
    projectPath: string,
    baseRef?: string,
    minReleaseAgeDays?: number,
  ): Promise<ChangeReport> {
    return request('/api/check-changes', {
      method: 'POST',
      body: JSON.stringify({
        project_path: projectPath,
        base_ref: baseRef || null,
        min_release_age_days: minReleaseAgeDays ?? null,
      }),
    });
  },

  async getIncidents(severity?: string): Promise<Incident[]> {
    const qs = severity ? `?severity=${severity}` : '';
    return request(`/api/incidents${qs}`);
  },

  async getMaintainerReputation(): Promise<MaintainerScore[]> {
    return request('/api/maintainers/reputation');
  },

  async getLockfiles(ecosystem?: string): Promise<LockfileEntry[]> {
    const qs = ecosystem ? `?ecosystem=${ecosystem}` : '';
    return request(`/api/lockfiles${qs}`);
  },

  async getStats(): Promise<Record<string, unknown>> {
    return request('/api/stats');
  },
};
