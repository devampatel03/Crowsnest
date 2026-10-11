/**
 * client.ts — Crowsnest API client
 *
 * Wraps all HTTP communication with the Crowsnest backend API.
 * All calls are guarded with try/catch so that a missing or unreachable
 * API server never causes unhandled promise rejections in the extension.
 */

import * as vscode from 'vscode';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

// ─────────────────────────────────────────────
// Public type definitions
// ─────────────────────────────────────────────

export interface VetoResult {
  /** Combined risk score: ai_authored_likelihood × slopsquat_probability (0–1) */
  probability: number;
  /** Whether the veto threshold was exceeded */
  vetoed: boolean;
  /** Human-readable signals driving the score */
  signals: string[];
  /** The package name that was checked */
  packageName: string;
  /** Optional version that was checked */
  version?: string;
  /** AI authored likelihood component */
  aiAuthoredLikelihood: number;
  /** Slopsquatting probability component */
  slopsquatProbability: number;
}

export interface NpmMetadata {
  description?: string;
  version?: string;
  author?: string;
  license?: string;
  weeklyDownloads?: number;
  firstPublished?: string;
  lastPublished?: string;
  maintainers?: string[];
}

export interface SocketAlert {
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  description: string;
}

export interface InvestigationResult {
  packageName: string;
  riskScore: number;
  verdict: string;
  npmMetadata?: NpmMetadata;
  socketAlerts?: SocketAlert[];
  queryFindings?: string[];
  summary?: string;
}

export interface StatsResult {
  activeIncidents: number;
  packagesScanned: number;
  packagesVetoed: number;
  apiHealthy: boolean;
}

// ─────────────────────────────────────────────
// CrowsnestClient
// ─────────────────────────────────────────────

/** Whole-request deadline, and the largest response body we will read (the API's answers are a few KB). */
const REQUEST_TIMEOUT_MS = 8000;
const MAX_RESPONSE_BYTES = 1024 * 1024;

export class CrowsnestClient {
  private apiUrl: string;

  constructor() {
    this.apiUrl = this.readApiUrl();
    // Watch for configuration changes so we pick up user edits immediately
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('crowsnest.apiUrl')) {
        this.apiUrl = this.readApiUrl();
      }
    });
  }

  private readApiUrl(): string {
    const cfg = vscode.workspace.getConfiguration('crowsnest');
    return cfg.get<string>('apiUrl', 'http://localhost:8000').replace(/\/$/, '');
  }

  // ─── Core HTTP helper ───────────────────────

  /**
   * Performs an HTTP/HTTPS request and resolves with the parsed JSON body.
   * Returns null on any network or parse error.
   */
  private request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown
  ): Promise<T | null> {
    return new Promise((resolve) => {
      try {
        const url = new URL(`${this.apiUrl}${path}`);
        const isHttps = url.protocol === 'https:';
        const lib = isHttps ? https : http;
        const payload = body !== undefined ? JSON.stringify(body) : undefined;

        const options: http.RequestOptions = {
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: url.pathname + url.search,
          method,
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
          },
          timeout: REQUEST_TIMEOUT_MS,
        };

        // `timeout` above only fires when the socket is idle, so a server that keeps sending a byte now and then
        // would hold the request open for ever. This deadline covers the whole request.
        const deadline = setTimeout(() => req.destroy(), REQUEST_TIMEOUT_MS);
        const done = (value: T | null): void => {
          clearTimeout(deadline);
          resolve(value);
        };

        const req = lib.request(options, (res) => {
          // An error status is a failed lookup, not a result: never show it as "clean".
          if ((res.statusCode ?? 0) >= 400) {
            res.resume();
            done(null);
            return;
          }
          const chunks: Buffer[] = [];
          let size = 0;
          res.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > MAX_RESPONSE_BYTES) {
              req.destroy();
              done(null);
              return;
            }
            chunks.push(chunk);
          });
          res.on('end', () => {
            try {
              const raw = Buffer.concat(chunks).toString('utf-8');
              done(JSON.parse(raw) as T);
            } catch {
              done(null);
            }
          });
          res.on('error', () => done(null));
          res.on('aborted', () => done(null));
        });

        req.on('error', () => done(null));
        req.on('timeout', () => { req.destroy(); done(null); });

        if (payload) {
          req.write(payload);
        }
        req.end();
      } catch {
        resolve(null);
      }
    });
  }

  // ─── Public API methods ─────────────────────

  /**
   * POST /api/veto
   * Returns null if the API is unreachable or returns an error.
   */
  async vetoCheck(packageName: string, version?: string): Promise<VetoResult | null> {
    const body: Record<string, string> = { package: packageName };
    if (version) {
      body['version'] = version;
    }

    const raw = await this.request<Record<string, unknown>>('POST', '/api/veto', body);
    if (!raw) {
      return null;
    }

    // Normalise the server response into our typed interface
    return {
      packageName,
      version,
      probability: this.asNumber(raw['probability'] ?? raw['risk_score'], 0),
      vetoed: Boolean(raw['blocked'] ?? raw['vetoed'] ?? raw['veto']),
      signals: this.asStringArray(raw['signals'] ?? raw['reasons']),
      aiAuthoredLikelihood: this.asNumber(raw['ai_authored_likelihood'], 0),
      slopsquatProbability: this.asNumber(raw['slopsquat_probability'], 0),
    };
  }

  /**
   * POST /api/investigate
   * Returns null if the API is unreachable or returns an error.
   */
  async investigatePackage(packageName: string): Promise<InvestigationResult | null> {
    const raw = await this.request<Record<string, unknown>>('POST', '/api/investigate', {
      package: packageName,
    });
    if (!raw) {
      return null;
    }

    const npmRaw = raw['npm_metadata'] as Record<string, unknown> | undefined;
    const sockRaw = raw['socket_alerts'] as unknown[] | undefined;

    return {
      packageName,
      riskScore: this.asNumber(raw['risk_score'] ?? raw['probability'], 0),
      verdict: String(raw['verdict'] ?? raw['summary'] ?? 'Unknown'),
      summary: raw['summary'] ? String(raw['summary']) : undefined,
      queryFindings: this.asStringArray(raw['query_findings'] ?? raw['findings']),
      npmMetadata: npmRaw
        ? {
            description: npmRaw['description'] ? String(npmRaw['description']) : undefined,
            version: npmRaw['version'] ? String(npmRaw['version']) : undefined,
            author: npmRaw['author'] ? String(npmRaw['author']) : undefined,
            license: npmRaw['license'] ? String(npmRaw['license']) : undefined,
            weeklyDownloads: npmRaw['weekly_downloads']
              ? Number(npmRaw['weekly_downloads'])
              : undefined,
            firstPublished: npmRaw['first_published']
              ? String(npmRaw['first_published'])
              : undefined,
            lastPublished: npmRaw['last_published']
              ? String(npmRaw['last_published'])
              : undefined,
            maintainers: this.asStringArray(npmRaw['maintainers']),
          }
        : undefined,
      socketAlerts: sockRaw
        ? sockRaw.map((a) => {
            const alert = a as Record<string, unknown>;
            return {
              severity: (alert['severity'] as SocketAlert['severity']) ?? 'low',
              category: String(alert['category'] ?? alert['type'] ?? 'Unknown'),
              description: String(alert['description'] ?? alert['message'] ?? ''),
            };
          })
        : undefined,
    };
  }

  /**
   * GET /api/stats
   * Returns null if the API is unreachable or returns an error.
   */
  async getStats(): Promise<StatsResult | null> {
    const raw = await this.request<Record<string, unknown>>('GET', '/api/stats');
    if (!raw) {
      return null;
    }

    return {
      activeIncidents: this.countIncidents(raw['active_incidents'] ?? raw['incidents']),
      packagesScanned: this.asNumber(raw['packages_scanned'] ?? raw['total_packages'] ?? raw['scanned'], 0),
      packagesVetoed: this.asNumber(raw['packages_vetoed'] ?? raw['vetoed'], 0),
      apiHealthy: true,
    };
  }

  // ─── Private coercion helpers ───────────────

  /** The API reports incidents as {CRITICAL, HIGH, MEDIUM, LOW} counts; older servers sent a number. */
  private countIncidents(value: unknown): number {
    if (value && typeof value === 'object') {
      return Object.values(value as Record<string, unknown>).reduce<number>(
        (sum, n) => sum + this.asNumber(n, 0),
        0
      );
    }
    return this.asNumber(value, 0);
  }

  private asNumber(value: unknown, fallback: number): number {
    const n = Number(value);
    return isNaN(n) ? fallback : n;
  }

  private asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.map((v) => String(v));
  }
}
