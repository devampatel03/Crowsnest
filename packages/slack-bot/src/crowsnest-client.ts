/**
 * HTTP client for the Crowsnest FastAPI backend.
 * All methods are async and throw descriptive errors on failure.
 * Polling-based scan completion is implemented with a configurable timeout.
 */

import type {
  ScanResult,
  ScanInitResponse,
  ScanStatusResponse,
  BlastRadiusResult,
  InvestigationResult,
  StatsResult,
} from './types.js';

const POLL_INTERVAL_MS = 2_000;   // Poll scan status every 2 seconds
const SCAN_TIMEOUT_MS  = 120_000; // Give up after 2 minutes

/**
 * Wraps fetch to throw a CrowsnestApiError on non-2xx responses.
 */
async function apiFetch<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(options?.headers ?? {}),
      },
    });
  } catch (err) {
    // Network-level failure (API is down, DNS failure, etc.)
    throw new CrowsnestApiError(
      `Cannot reach Crowsnest API at ${url}: ${(err as Error).message}`,
      0
    );
  }

  if (!response.ok) {
    let body = '';
    try {
      body = await response.text();
    } catch {
      // The status code alone is enough for the error message.
    }
    throw new CrowsnestApiError(
      `Crowsnest API returned ${response.status} for ${url}: ${body}`,
      response.status
    );
  }

  return response.json() as Promise<T>;
}

export class CrowsnestApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = 'CrowsnestApiError';
  }

  /** True when the failure is a network-level error (API is completely down). */
  get isNetworkError(): boolean {
    return this.statusCode === 0;
  }
}

export class CrowsnestApiClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    // Strip trailing slash for consistent URL construction
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  /**
   * Initiates a scan for the given project path and polls until it is complete.
   *
   * @param projectPath - Absolute path to the project on the server's filesystem
   * @returns Completed ScanResult with all detected incidents
   * @throws CrowsnestApiError if the API is unreachable or returns an error
   * @throws Error if the scan exceeds the 120-second timeout
   */
  async scan(projectPath: string): Promise<ScanResult> {
    const init = await apiFetch<ScanInitResponse>(
      `${this.baseUrl}/api/scan`,
      {
        method: 'POST',
        body: JSON.stringify({ project_path: projectPath }),
      }
    );

    const scanId = init.scan_id ?? init.id;
    if (!scanId) {
      throw new Error('Crowsnest API did not return a scan id');
    }

    // Poll until the scan finishes or the timeout passes.
    const deadline = Date.now() + SCAN_TIMEOUT_MS;

    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);

      const status = await apiFetch<ScanStatusResponse>(
        `${this.baseUrl}/api/scan/${scanId}/status`
      );

      if (status.status === 'complete') {
        // Shape the completed status into a ScanResult
        return {
          scan_id:          scanId,
          project_path:     projectPath,
          status:           'complete',
          incidents:        status.incidents ?? [],
          packages_scanned: 0, // Server may not include this in status
          duration_ms:      SCAN_TIMEOUT_MS - (deadline - Date.now()),
          scanned_at:       new Date().toISOString(),
          // Allow server to override these if it sends them
          ...(status as unknown as Partial<ScanResult>),
        };
      }

      if (status.status === 'failed') {
        throw new CrowsnestApiError(
          `Scan ${scanId} failed: ${status.error ?? 'unknown error'}`,
          500
        );
      }

      // status is 'pending' or 'running' — keep polling
      console.log(
        `[crowsnest-client] Scan ${scanId} is ${status.status}` +
          (status.progress != null ? ` (${status.progress}%)` : '')
      );
    }

    throw new Error(
      `Scan ${scanId} did not complete within ${SCAN_TIMEOUT_MS / 1000} seconds. ` +
        `Check the Crowsnest API for status.`
    );
  }

  /**
   * Returns the blast radius if the given maintainer account were compromised.
   *
   * @param maintainer - npm/GitHub login of the maintainer
   */
  async blastRadius(maintainer: string): Promise<BlastRadiusResult> {
    const raw = await apiFetch<any>(
      `${this.baseUrl}/api/blast-radius`,
      {
        method: 'POST',
        body: JSON.stringify({ maintainer }),
      }
    );
    return {
      maintainer: raw.maintainer,
      compromised_packages: raw.packages_controlled ?? [],
      affected_projects: raw.affected_projects ?? [],
      affected_packages: raw.packages_controlled ?? [],
      total_affected: raw.total_affected_deps ?? 0,
      runtime_exposed: (raw.runtime_confirmed_count ?? 0) > 0,
      risk_score: (raw.total_affected_deps ?? 0) > 0 ? 0.8 : 0.0,
    };
  }

  /**
   * Investigates a single package for supply chain compromise.
   *
   * @param pkg - Package name (optionally with @version, e.g. "left-pad@1.3.0")
   */
  async investigate(pkg: string): Promise<InvestigationResult> {
    const raw = await apiFetch<any>(
      `${this.baseUrl}/api/investigate`,
      {
        method: 'POST',
        body: JSON.stringify({ package: pkg }),
      }
    );

    const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
    const assessment = raw.assessment ?? {};
    const signals = list(assessment.signals);
    const notChecked = list(assessment.degraded);
    const risk = Number(assessment.probability) || 0;

    // The call comes from the backend's install check, the same answer `crowsnest install` acts on. A backend that
    // sends none gets no verdict at all, never a made-up Clear.
    let call: InvestigationResult['call'] = 'Not fully checked';
    if (raw.assessment) {
      if (assessment.blocked) call = 'Hold';
      else if (signals.length > 0 || risk > 0) call = 'Watch';
      else if (notChecked.length === 0) call = 'Clear';
    } else {
      notChecked.push('this backend is too old to give a verdict; run crowsnest start to update it');
    }

    let ageDays: number | null = null;
    if (raw.npm_metadata?.created_at) {
      const created = new Date(raw.npm_metadata.created_at).getTime();
      if (!Number.isNaN(created)) ageDays = Math.max(0, Math.floor((Date.now() - created) / (1000 * 60 * 60 * 24)));
    }

    return {
      package: pkg,
      call,
      risk,
      signals,
      not_checked: notChecked,
      weekly_downloads: raw.npm_metadata?.weekly_downloads ?? null,
      age_days: ageDays,
      maintainers: list(raw.npm_metadata?.maintainers),
      socket_alerts: raw.socket_alerts?.length ?? 0,
    };
  }

  /**
   * Returns system-wide statistics from the Crowsnest API.
   */
  async getStats(): Promise<StatsResult> {
    return apiFetch<StatsResult>(`${this.baseUrl}/api/stats`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
