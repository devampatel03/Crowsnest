import type {
  BlastRadiusEntry,
  BlastRadiusResult,
  Incident,
  LockfileEntry,
  MaintainerScore,
  ScanStatus,
  Severity,
  StatsResult,
  VetoResult,
} from './types';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

/** The backend caps /api/incidents at 500 (no offset, no total). The console always asks for the cap. */
export const INCIDENT_LIMIT = 500;
/** /api/lockfiles is `LIMIT 1000` server-side. */
export const LOCKFILE_CAP = 1000;
/** /api/maintainers/reputation default fetch size. */
export const MAINTAINER_LIMIT = 100;

/** Carries the HTTP status and path. Never printed: `describeError` is the only source of error text. */
export class ApiError extends Error {
  readonly status: number | null;
  readonly path: string;
  constructor(message: string, status: number | null, path: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.path = path;
  }
}

/** True when the request never got an answer (server down, offline, timed out). */
export function isUnreachable(error: unknown): boolean {
  return error instanceof ApiError ? error.status === null : error instanceof TypeError;
}

/**
 * The one place error text comes from. Plain words, no status codes in the
 * sentence, never "Failed to fetch". Pages pass the result to `ErrorBlock`.
 */
export function describeError(error: unknown, apiUrl: string = API_URL): string {
  if (isUnreachable(error)) return `We couldn't reach Crowsnest at ${apiUrl}. Is it running?`;
  if (error instanceof ApiError && error.status !== null) {
    return error.status >= 500
      ? 'Crowsnest ran into a problem and could not answer. Try again in a moment.'
      : "Crowsnest couldn't answer that request.";
  }
  return 'Something went wrong while loading this page. Try again.';
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const bare = path.split('?')[0];
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...options.headers },
      cache: 'no-store',
    });
    if (!res.ok) throw new ApiError(await res.text().catch(() => res.statusText), res.status, bare);
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    const aborted = e instanceof DOMException && e.name === 'AbortError';
    throw new ApiError(aborted ? 'timed out' : e instanceof Error ? e.message : 'network error', null, bare);
  } finally {
    clearTimeout(timeout);
  }
}

const SEVERITIES: readonly Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function str(v: unknown, fallback = ''): string {
  return v === null || v === undefined ? fallback : String(v);
}
/** Number, numeric string ("1.00") or fallback. Never NaN or Infinity. */
export function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}
function bool(v: unknown): boolean {
  return v === true || v === 'true' || v === 1;
}
function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => str(x)).filter(Boolean) : [];
}
function isoOrEmpty(v: unknown): string {
  const s = str(v);
  return s && !Number.isNaN(Date.parse(s)) ? s : '';
}
function severityOf(v: unknown): Severity {
  const s = str(v).toUpperCase();
  return (SEVERITIES as readonly string[]).includes(s) ? (s as Severity) : 'LOW';
}
function list(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** Windows drive letters differ only in case across rows (C:\ vs c:\): fold the drive letter to upper case. */
export function normalisePath(p: string): string {
  return p.replace(/^([a-zA-Z]):/, (_, d: string) => d.toUpperCase() + ":");
}

/** A chain arrives as an array; a string fallback is `a > b`, `a,b` or a JSON array. */
export function toChain(v: unknown): string[] {
  if (Array.isArray(v)) return strList(v);
  if (typeof v === 'string' && v.trim()) {
    const t = v.trim();
    if (t.startsWith('[')) {
      try {
        const parsed: unknown = JSON.parse(t);
        if (Array.isArray(parsed)) return strList(parsed);
      } catch {
        /* fall through to splitting */
      }
    }
    return t.split(/\s*(?:›|>|,|\|)\s*/).filter(Boolean);
  }
  return [];
}

/** One BLAST_RADIUS SQL row (or an already-typed entry) to a BlastRadiusEntry. */
export function normaliseBlastEntry(raw: unknown): BlastRadiusEntry {
  const r = rec(raw);
  const status = r.runtime_status;
  const observed = status !== undefined && status !== null && status !== 'not_observed_at_runtime';
  const loaded = r.last_runtime_load;
  return {
    project_path: normalisePath(str(r.our_project ?? r.project_path)),
    package: str(r.affected_dep ?? r.package),
    version: str(r.version),
    declared_in: str(r.declared_in),
    runtime_confirmed: typeof r.runtime_confirmed === 'boolean' ? r.runtime_confirmed : observed,
    compromised_root: r.compromised_root == null ? undefined : str(r.compromised_root),
    parent_chain: toChain(r.parent_chain),
    last_runtime_load: loaded == null || loaded === 'never' ? null : str(loaded),
  };
}

export function normaliseIncident(raw: unknown): Incident {
  const r = rec(raw);
  return {
    id: str(r.id),
    attack_pattern: str(r.attack_pattern),
    confidence: num(r.confidence),
    severity: severityOf(r.severity),
    packages: strList(r.packages),
    blast_radius: list(r.blast_radius).map(normaliseBlastEntry),
    runtime_confirmation: bool(r.runtime_confirmation),
    remediation_options: strList(r.remediation_options),
    detected_at: isoOrEmpty(r.detected_at),
    raw_findings: list(r.raw_findings).filter((x): x is Record<string, unknown> => !!x && typeof x === 'object'),
  };
}

function findingLogin(i: Incident): string {
  for (const f of i.raw_findings) {
    const v = f.login ?? f.maintainer ?? f.maintainer_login ?? f.published_by;
    if (typeof v === 'string' && v.trim()) return v.trim().toLowerCase();
  }
  return '';
}

/** Same kind of call about the same subject on the same day is one call. */
export function incidentKey(i: Incident): string {
  const subject = findingLogin(i) || [...i.packages].sort().join(',');
  return `${i.attack_pattern}|${subject}|${i.detected_at.slice(0, 10)}`;
}

/** De-duplicates by pattern + subject + day, keeping the entry with the most detail. */
export function normaliseIncidents(raw: unknown): Incident[] {
  const best = new Map<string, Incident>();
  for (const i of list(raw).map(normaliseIncident).filter((x) => x.id !== '')) {
    const k = incidentKey(i);
    const cur = best.get(k);
    const weight = (x: Incident) => x.blast_radius.length + x.packages.length;
    if (!cur || weight(i) > weight(cur)) best.set(k, i);
  }
  return [...best.values()];
}

export function normaliseMaintainer(raw: unknown): MaintainerScore {
  const r = rec(raw);
  return {
    login: str(r.login),
    packages_in_graph: num(r.packages_in_graph),
    commits_90d: num(r.commits_90d),
    gpg_sign_ratio: num(r.gpg_sign_ratio),
    repos_touched: num(r.repos_touched),
    days_on_platform: num(r.days_on_platform),
    ioc_flagged: bool(r.ioc_flagged),
    risk_score: Math.min(1, Math.max(0, num(r.risk_score))),
  };
}

export function normaliseMaintainers(raw: unknown): MaintainerScore[] {
  return list(raw).map(normaliseMaintainer).filter((m) => m.login !== '');
}

export function normaliseLockfile(raw: unknown): LockfileEntry {
  const r = rec(raw);
  return {
    project_path: normalisePath(str(r.project_path)),
    ecosystem: str(r.ecosystem, 'npm'),
    package: str(r.package),
    version: str(r.version),
    integrity_hash: str(r.integrity_hash),
    resolved_url: str(r.resolved_url),
    declared_in: str(r.declared_in),
    parent_chain: toChain(r.parent_chain),
  };
}

/** One row per package + version + project (the backend repeats rows when project paths differ in case). */
export function normaliseLockfiles(raw: unknown): LockfileEntry[] {
  const seen = new Set<string>();
  const out: LockfileEntry[] = [];
  for (const e of list(raw).map(normaliseLockfile)) {
    if (!e.package) continue;
    const k = `${e.project_path.toLowerCase()}|${e.ecosystem}|${e.package}|${e.version}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}

export function normaliseStats(raw: unknown): StatsResult {
  const r = rec(raw);
  const counts: Record<string, number> = {};
  for (const [k, v] of Object.entries(rec(r.table_counts))) counts[k] = num(v);
  const active = rec(r.active_incidents);
  const hasTotal = r.total_packages !== undefined && r.total_packages !== null;
  const hasMaint = r.total_maintainers !== undefined && r.total_maintainers !== null;
  return {
    table_counts: counts,
    total_incidents: num(r.total_incidents),
    active_scans: num(r.active_scans),
    total_packages: hasTotal ? num(r.total_packages) : null,
    total_maintainers: hasMaint ? num(r.total_maintainers) : null,
    active_incidents: {
      CRITICAL: num(active.CRITICAL),
      HIGH: num(active.HIGH),
      MEDIUM: num(active.MEDIUM),
      LOW: num(active.LOW),
    },
    last_scan_at: isoOrEmpty(r.last_scan_at) || null,
    last_scan_project: r.last_scan_project == null ? null : str(r.last_scan_project),
  };
}

export function normaliseBlast(raw: unknown, maintainer: string): BlastRadiusResult {
  const r = rec(raw);
  const entries = list(r.blast_radius_entries).map(normaliseBlastEntry);
  return {
    maintainer: str(r.maintainer) || maintainer,
    packages_controlled: strList(r.packages_controlled),
    affected_projects: strList(r.affected_projects),
    total_affected_deps: num(r.total_affected_deps, entries.length),
    blast_radius_entries: entries,
    runtime_confirmed_count: num(r.runtime_confirmed_count, entries.filter((e) => e.runtime_confirmed).length),
  };
}

export function normaliseVeto(raw: unknown, pkg: string): VetoResult {
  const r = rec(raw);
  const signals = strList(r.signals);
  return {
    blocked: bool(r.blocked),
    package: str(r.package) || pkg,
    version: r.version == null ? null : str(r.version),
    probability: Math.min(1, Math.max(0, num(r.probability))),
    signals,
    reason: str(r.reason) || signals[0] || '',
    override_flag: r.override_flag == null ? null : str(r.override_flag),
  };
}

export function normaliseScanStatus(raw: unknown): ScanStatus {
  const r = rec(raw);
  const s = str(r.status);
  const status = s === 'pending' || s === 'running' || s === 'complete' || s === 'failed' ? s : 'running';
  return {
    id: str(r.id),
    status,
    started_at: isoOrEmpty(r.started_at),
    finished_at: isoOrEmpty(r.finished_at) || undefined,
    project_path: str(r.project_path),
    incidents: normaliseIncidents(r.incidents),
    error: r.error == null ? undefined : str(r.error),
  };
}

/** SWR keys shared across pages (one request, many consumers). */
export const KEYS = {
  incidents: `/api/incidents?limit=${INCIDENT_LIMIT}`,
  stats: '/api/stats',
  maintainers: `/api/maintainers/reputation?limit=${MAINTAINER_LIMIT}`,
  lockfiles: '/api/lockfiles',
} as const;

export async function fetchIncidents(limit: number = INCIDENT_LIMIT): Promise<Incident[]> {
  return normaliseIncidents(await apiFetch<unknown>(`/api/incidents?limit=${limit}`));
}

export async function fetchLockfiles(): Promise<LockfileEntry[]> {
  return normaliseLockfiles(await apiFetch<unknown>('/api/lockfiles'));
}

export async function fetchMaintainerReputation(): Promise<MaintainerScore[]> {
  return normaliseMaintainers(await apiFetch<unknown>(`/api/maintainers/reputation?limit=${MAINTAINER_LIMIT}`));
}

export async function fetchStats(): Promise<StatsResult> {
  return normaliseStats(await apiFetch<unknown>('/api/stats'));
}

export async function fetchScanStatus(scanId: string): Promise<ScanStatus> {
  return normaliseScanStatus(await apiFetch<unknown>(`/api/scan/${encodeURIComponent(scanId)}/status`));
}

/** Starts a scan. Only the scan dialog calls this, and only on the user's explicit action. */
export async function triggerScan(projectPath: string): Promise<{ scan_id: string }> {
  const r = rec(await apiFetch<unknown>('/api/scan', { method: 'POST', body: JSON.stringify({ project_path: projectPath }) }));
  return { scan_id: str(r.scan_id) };
}

/** Read-only: who depends on packages this person maintains. */
export async function fetchBlastRadius(maintainer: string): Promise<BlastRadiusResult> {
  const raw = await apiFetch<unknown>('/api/blast-radius', { method: 'POST', body: JSON.stringify({ maintainer }) });
  return normaliseBlast(raw, maintainer);
}

/** Read-only pre-install check. Changes nothing on the backend. */
export async function vetoCheck(pkg: string, version?: string, ecosystem: string = 'npm'): Promise<VetoResult> {
  const raw = await apiFetch<unknown>('/api/veto', { method: 'POST', body: JSON.stringify({ package: pkg, version, ecosystem }) });
  return normaliseVeto(raw, pkg);
}
