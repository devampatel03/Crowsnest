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
          timeout: 8000,
        };

        const req = lib.request(options, (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            try {
              const raw = Buffer.concat(chunks).toString('utf-8');
              resolve(JSON.parse(raw) as T);
            } catch {
              resolve(null);
            }
          });
        });

        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });

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
    const body: Record<string, string> = { package_name: packageName };
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
      vetoed: Boolean(raw['vetoed'] ?? raw['veto']),
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
      package_name: packageName,
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
      activeIncidents: this.asNumber(raw['active_incidents'] ?? raw['incidents'], 0),
      packagesScanned: this.asNumber(raw['packages_scanned'] ?? raw['scanned'], 0),
      packagesVetoed: this.asNumber(raw['packages_vetoed'] ?? raw['vetoed'], 0),
      apiHealthy: true,
    };
  }

  // ─── Private coercion helpers ───────────────

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
