/**
 * src/crowsnest-client.ts
 *
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 2_000;   // Poll scan status every 2 seconds
const SCAN_TIMEOUT_MS  = 120_000; // Give up after 2 minutes

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

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
      // ignore
    }
    throw new CrowsnestApiError(
      `Crowsnest API returned ${response.status} for ${url}: ${body}`,
      response.status
    );
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Custom error class
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class CrowsnestApiClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    // Strip trailing slash for consistent URL construction
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  // -------------------------------------------------------------------------
  // scan
  // -------------------------------------------------------------------------

  /**
   * Initiates a scan for the given project path and polls until it is complete.
   *
   * @param projectPath - Absolute path to the project on the server's filesystem
   * @returns Completed ScanResult with all detected incidents
   * @throws CrowsnestApiError if the API is unreachable or returns an error
   * @throws Error if the scan exceeds the 120-second timeout
   */
  async scan(projectPath: string): Promise<ScanResult> {
    // 1. Start the scan
    const init = await apiFetch<ScanInitResponse>(
      `${this.baseUrl}/api/scan`,
      {
        method: 'POST',
        body: JSON.stringify({ project_path: projectPath }),
      }
    );

    const scanId = init.id;

    // 2. Poll until complete or timeout
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

  // -------------------------------------------------------------------------
  // blast-radius
  // -------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // investigate
  // -------------------------------------------------------------------------

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

    const socketAlertsCount = raw.socket_alerts?.length ?? 0;
    const weeklyDownloads = raw.npm_metadata?.weekly_downloads ?? 0;
    
    // Check findings for critical alerts
    const iocHits = raw.findings?.IOC_MATCH?.length ?? 0;
    const shaiHuludHits = raw.findings?.SHAI_HULUD?.length ?? 0;
    const sleeperHits = raw.findings?.SLEEPER_DEPENDENCY?.length ?? 0;
    
    let verdict: 'clean' | 'suspicious' | 'compromised' = 'clean';
    let summary = 'No security issues detected. Package appears normal.';
    
    if (iocHits > 0 || shaiHuludHits > 0) {
      verdict = 'compromised';
      summary = `CRITICAL: Known Indicators of Compromise (IOC) matched. ${iocHits} active threat matches found.`;
    } else if (socketAlertsCount > 0 || sleeperHits > 0 || weeklyDownloads < 1000) {
      verdict = 'suspicious';
      summary = `WARNING: Suspicious signals detected. Contains ${socketAlertsCount} socket.dev alerts and low download counts.`;
    }

    let ageDays = 365;
    if (raw.npm_metadata?.created_at) {
      try {
        const created = new Date(raw.npm_metadata.created_at);
        ageDays = Math.max(0, Math.floor((Date.now() - created.getTime()) / (1000 * 60 * 60 * 24)));
      } catch (e) {
        // ignore
      }
    }

    const maintainerChanges = raw.findings?.IDENTITY_DRIFT?.length ?? 0;

    return {
      package: pkg,
      incident: raw.findings?.IOC_MATCH?.[0] ? {
        id: raw.findings.IOC_MATCH[0].id ?? 'ioc-match',
        attack_pattern: 'maintainer_takeover',
        confidence: 0.9,
        severity: 'CRITICAL',
        packages: [pkg],
        blast_radius: raw.findings.IOC_MATCH[0].blast_radius ?? 1,
        runtime_confirmation: false,
        remediation_options: ['Pin to a known-safe version', 'Audit recent maintainer changes'],
        detected_at: new Date().toISOString()
      } : null,
      analysis: {
        maintainer_changes: maintainerChanges,
        days_since_maintainer_change: maintainerChanges > 0 ? 30 : null,
        commit_pattern_anomaly: maintainerChanges > 0,
        slsa_attestation: weeklyDownloads > 50000,
        slsa_pipeline_risk: false,
        socket_alerts: socketAlertsCount,
        weekly_downloads: weeklyDownloads,
        age_days: ageDays
      },
      verdict,
      summary
    };
  }

  // -------------------------------------------------------------------------
  // stats
  // -------------------------------------------------------------------------

  /**
   * Returns system-wide statistics from the Crowsnest API.
   */
  async getStats(): Promise<StatsResult> {
    return apiFetch<StatsResult>(`${this.baseUrl}/api/stats`);
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
