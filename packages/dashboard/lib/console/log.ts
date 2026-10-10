import { bucketOf, compareCalls, headlineFor, incidentPackages, type Bucket } from '@/lib/calls';
import type { Incident } from '@/lib/types';

export const LOG_PAGE_SIZE = 25;

/** URL state of the Log filters. `v` is the set of seriousness levels that are on. */
export type LogFilterState = { v: string; q: string; from: string; to: string; page: string };
export const LOG_DEFAULTS: LogFilterState = { v: 'hold,watch,note', q: '', from: '', to: '', page: '1' };

/** `From` must not be after `To`. Returns the message or null. */
export function validateRange(from: string, to: string): string | null {
  return from && to && from > to ? 'The start date is after the end date.' : null;
}

/** Local calendar-day bounds of a `YYYY-MM-DD` value (inclusive). */
function dayStart(d: string): number {
  return new Date(`${d}T00:00:00`).getTime();
}
function dayEnd(d: string): number {
  return new Date(`${d}T23:59:59.999`).getTime();
}

/** Text that search matches: the plain headline and the package names. Never a pattern code. */
function searchText(i: Incident): string {
  return `${headlineFor(i.attack_pattern)} ${incidentPackages(i).join(' ')}`.toLowerCase();
}

/** Pure client-side filter. Worst first, then newest. */
export function filterLog(list: readonly Incident[], f: LogFilterState): Incident[] {
  const on = new Set(f.v.split(',').filter(Boolean) as Bucket[]);
  const bad = validateRange(f.from, f.to) !== null;
  const lo = f.from && !bad ? dayStart(f.from) : null;
  const hi = f.to && !bad ? dayEnd(f.to) : null;
  const q = f.q.trim().toLowerCase();
  return list
    .filter((i) => {
      if (!on.has(bucketOf(i.severity))) return false;
      if (q && !searchText(i).includes(q)) return false;
      const t = Date.parse(i.detected_at);
      if (lo !== null && !(t >= lo)) return false;
      if (hi !== null && !(t <= hi)) return false;
      return true;
    })
    .sort(compareCalls);
}

export function pageCount(n: number): number {
  return Math.max(1, Math.ceil(n / LOG_PAGE_SIZE));
}

/** Clamped, 1-based. */
export function pageOf(raw: string, total: number): number {
  const n = Number.parseInt(raw, 10);
  return Math.min(Math.max(Number.isFinite(n) ? n : 1, 1), pageCount(total));
}

export function filtersActive(f: LogFilterState): boolean {
  return f.v !== LOG_DEFAULTS.v || f.q !== '' || f.from !== '' || f.to !== '';
}

/** Newest call first (the Log's order). Equal times keep their order. */
export function newestFirst(list: readonly Incident[]): Incident[] {
  return [...list].sort((a, b) => (Date.parse(b.detected_at) || 0) - (Date.parse(a.detected_at) || 0));
}

export type DateGroup = 'Today' | 'This week' | 'Earlier';

/** Today = the same local calendar day; This week = the 6 days before it; Earlier = anything older. */
export function dateGroup(iso: string, now: number): DateGroup {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 'Earlier';
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const today = startOfToday.getTime();
  if (t >= today) return 'Today';
  if (t >= today - 6 * 86_400_000) return 'This week';
  return 'Earlier';
}

/** Splits a newest-first list into its Today / This week / Earlier runs, keeping order. Empty groups are omitted. */
export function groupByDate(list: readonly Incident[], now: number): { group: DateGroup; items: Incident[] }[] {
  const out: { group: DateGroup; items: Incident[] }[] = [];
  for (const i of list) {
    const g = dateGroup(i.detected_at, now);
    const last = out[out.length - 1];
    if (last && last.group === g) last.items.push(i);
    else out.push({ group: g, items: [i] });
  }
  return out;
}
