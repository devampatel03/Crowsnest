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
    return apiFetch<BlastRadiusResult>(
      `${this.baseUrl}/api/blast-radius`,
      {
        method: 'POST',
        body: JSON.stringify({ maintainer }),
      }
    );
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
    return apiFetch<InvestigationResult>(
      `${this.baseUrl}/api/investigate`,
      {
        method: 'POST',
        body: JSON.stringify({ package: pkg }),
      }
    );
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
