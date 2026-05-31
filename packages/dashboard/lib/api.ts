import type { Incident, LockfileEntry, MaintainerScore, StatsResult } from './types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...options.headers },
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`API ${res.status}: ${await res.text()}`);
    }
    return res.json() as Promise<T>;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchIncidents(severity?: string): Promise<Incident[]> {
  const qs = severity ? `?severity=${severity}` : '';
  return apiFetch<Incident[]>(`/api/incidents${qs}`);
}

export async function triggerScan(projectPath: string): Promise<{ scan_id: string }> {
  return apiFetch('/api/scan', {
    method: 'POST',
    body: JSON.stringify({ project_path: projectPath }),
  });
}

export async function fetchLockfiles(ecosystem?: string): Promise<LockfileEntry[]> {
  const qs = ecosystem ? `?ecosystem=${ecosystem}` : '';
  return apiFetch<LockfileEntry[]>(`/api/lockfiles${qs}`);
}

export async function fetchMaintainerReputation(): Promise<MaintainerScore[]> {
  return apiFetch<MaintainerScore[]>('/api/maintainers/reputation');
}

export async function fetchStats(): Promise<StatsResult> {
  return apiFetch<StatsResult>('/api/stats');
}

export async function replayIncident(iocName: string, date?: string) {
  return apiFetch('/api/replay', {
    method: 'POST',
    body: JSON.stringify({ ioc_name: iocName, snapshot_date: date }),
  });
}

export async function fetchBlastRadius(maintainer: string) {
  return apiFetch('/api/blast-radius', {
    method: 'POST',
    body: JSON.stringify({ maintainer }),
  });
}
