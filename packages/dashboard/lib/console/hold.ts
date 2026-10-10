import { compareCalls, incidentPackages, projectName } from '@/lib/calls';
import { gaugeFromSeverity, type GaugeLevel } from '@/components/system/Gauge';
import type { Incident, LockfileEntry } from '@/lib/types';

/** One row of the package list. `incident` is the worst call that names the package, or null (No flags). */
export type HoldRow = {
  key: string;
  entry: LockfileEntry;
  incident: Incident | null;
  level: GaugeLevel | null;
  urgent: boolean;
  /** 0 urgent, 1 hold, 2 watch, 3 note, 4 no flags. */
  rank: number;
};

const RANK: Record<Incident['severity'], number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

/** Worst call per package name. Built once; lookups are O(1). */
export function incidentIndex(incidents: readonly Incident[]): Map<string, Incident> {
  const byName = new Map<string, Incident>();
  for (const inc of [...incidents].sort(compareCalls)) {
    for (const p of incidentPackages(inc)) if (!byName.has(p)) byName.set(p, inc);
  }
  return byName;
}

/** Rows keep the backend's order until sorted; the key stays unique even for repeated lockfile rows. */
export function holdRows(entries: readonly LockfileEntry[], incidents: readonly Incident[]): HoldRow[] {
  const idx = incidentIndex(incidents);
  const seen = new Map<string, number>();
  return entries.map((entry) => {
    const base = `${entry.project_path}|${entry.ecosystem}|${entry.package}|${entry.version}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    const incident = idx.get(entry.package) ?? null;
    const g = incident ? gaugeFromSeverity(incident.severity) : null;
    return {
      key: n === 0 ? base : `${base}#${n}`,
      entry,
      incident,
      level: g?.level ?? null,
      urgent: g?.urgent ?? false,
      rank: incident ? RANK[incident.severity] : 4,
    };
  });
}

/** Default order: worst first, then package name. */
export function compareRows(a: HoldRow, b: HoldRow): number {
  return a.rank - b.rank || a.entry.package.localeCompare(b.entry.package, 'en', { numeric: true });
}

export function filterRows(rows: readonly HoldRow[], q: string, ecosystem: string): HoldRow[] {
  const needle = q.trim().toLowerCase();
  return rows.filter((r) => {
    if (ecosystem !== 'all' && r.entry.ecosystem !== ecosystem) return false;
    if (!needle) return true;
    const e = r.entry;
    return `${e.package} ${e.version} ${e.project_path}`.toLowerCase().includes(needle);
  });
}

/** Counts per ecosystem for the stacked bar, biggest first. */
export function ecosystemCounts(rows: readonly HoldRow[]): { ecosystem: string; count: number }[] {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.entry.ecosystem, (m.get(r.entry.ecosystem) ?? 0) + 1);
  return [...m.entries()].map(([ecosystem, count]) => ({ ecosystem, count })).sort((a, b) => b.count - a.count);
}

/** Project shown by its folder name only. */
export function projectLabel(path: string): string {
  return projectName(path);
}

/** `Brought in by a › b.` or `You added this directly.` */
export function whyHere(entry: Pick<LockfileEntry, 'declared_in' | 'parent_chain'>): string {
  const chain = entry.parent_chain.filter(Boolean);
  if (entry.declared_in === 'direct' || chain.length === 0) return 'You added this directly.';
  return `Brought in by ${chain.join(' › ')}.`;
}

/** `676 shown of 676`. `total` is the true count; `filtered` prints the match count instead. */
export function shownLine(shown: number, total: number | null, filtered: boolean): string {
  const s = shown.toLocaleString('en-US');
  if (filtered) return `${s} match`;
  return `${s} shown of ${Math.max(total ?? shown, shown).toLocaleString('en-US')}`;
}

/** Flagged = has a call against it. */
export function filterFlagged(rows: readonly HoldRow[], flaggedOnly: boolean): HoldRow[] {
  return flaggedOnly ? rows.filter((r) => r.incident !== null) : [...rows];
}
