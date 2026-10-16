/**
 * Pure data transforms for the charts. No React, no DOM, no clock reads
 * (callers pass `now`), so every function is unit-testable at known times.
 * Numeric fields are coerced defensively: the API sends "1.00" as often as 1.
 */
import type { DailyCallIncident, EcosystemCount, Numeric, RankingMaintainer } from './contracts';

/** "1.00" -> 1, "abc" / null / NaN / Infinity -> 0. Never throws. */
export function toNum(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
}

const DAY_MS = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/* ------------------------------------------------------------ DailyCalls -- */

export type CallLevel = 'hold' | 'watch' | 'note';

/** HIGH and CRITICAL are Hold, MEDIUM is Watch, everything else is a Note (matches gaugeFromSeverity). */
export function levelOf(severity: unknown): CallLevel {
  const s = typeof severity === 'string' ? severity.trim().toUpperCase() : '';
  if (s === 'CRITICAL' || s === 'HIGH') return 'hold';
  if (s === 'MEDIUM') return 'watch';
  return 'note';
}

export interface DayBucket {
  /**
   * Plot position, epoch ms: the MIDDLE of the day. Every series of the chart
   * (hold, watch, note) shares this one numeric value as its x, and the axis
   * domain is [first.start, last.end], so a bar sits at exactly this time.
   */
  t: number;
  /** Start of the day (local or UTC midnight), epoch ms. */
  start: number;
  /** Start of the next day, epoch ms. Not inside this bucket. */
  end: number;
  hold: number;
  watch: number;
  note: number;
  total: number;
}

interface Parts {
  y: number;
  m: number;
  d: number;
}

function partsOf(ms: number, utc: boolean): Parts {
  const dt = new Date(ms);
  return utc
    ? { y: dt.getUTCFullYear(), m: dt.getUTCMonth(), d: dt.getUTCDate() }
    : { y: dt.getFullYear(), m: dt.getMonth(), d: dt.getDate() };
}

/** Midnight of the calendar day containing `ms`, plus `offsetDays` calendar days (DST-safe in local mode). */
export function dayStart(ms: number, offsetDays = 0, utc = false): number {
  const { y, m, d } = partsOf(ms, utc);
  return utc ? Date.UTC(y, m, d + offsetDays) : new Date(y, m, d + offsetDays).getTime();
}

/**
 * `days` consecutive day buckets ending with the day that contains `now`.
 * Incidents outside the window, in the future, or with an unparseable time are
 * dropped (never thrown on). Empty days are present with zero counts, so the
 * series has no gaps and every day has a position.
 */
export function dailyBuckets(
  incidents: readonly DailyCallIncident[],
  days: number,
  now: number,
  utc = false,
): DayBucket[] {
  const n = Math.max(1, Math.floor(toNum(days)) || 1);
  const buckets: DayBucket[] = [];
  for (let i = 0; i < n; i++) {
    const start = dayStart(now, i - (n - 1), utc);
    const end = dayStart(now, i - (n - 1) + 1, utc);
    buckets.push({ t: start + (end - start) / 2, start, end, hold: 0, watch: 0, note: 0, total: 0 });
  }
  const first = buckets[0].start;
  const last = buckets[n - 1].end;
  for (const inc of incidents) {
    const ts = new Date(inc?.detected_at).getTime();
    if (!Number.isFinite(ts) || ts < first || ts >= last) continue;
    // Binary search for the bucket with start <= ts < end.
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (buckets[mid].start <= ts) lo = mid;
      else hi = mid - 1;
    }
    const b = buckets[lo];
    b[levelOf(inc.severity)] += 1;
    b.total += 1;
  }
  return buckets;
}

/** The x-axis domain: the first midnight to the last day's end. Both are real timestamps. */
export function dailyDomain(buckets: readonly DayBucket[]): [number, number] {
  return [buckets[0].start, buckets[buckets.length - 1].end];
}

/** Y-axis top: at least 3 so an empty chart still has a scale, otherwise the busiest day. */
export function dailyYMax(buckets: readonly DayBucket[]): number {
  return Math.max(3, buckets.reduce((a, b) => Math.max(a, b.total), 0));
}

/** "Today", "7 days ago": how far a bucket is from the newest one. Relative on the axis; ISO is for the tooltip. */
export function relativeDayLabel(bucketIndex: number, count: number): string {
  const ago = count - 1 - bucketIndex;
  if (ago <= 0) return 'Today';
  if (ago === 1) return 'Yesterday';
  return `${ago} days ago`;
}

/**
 * Axis ticks as plot positions (bucket midpoints), counted back from today so
 * "Today" always has a tick. `target` is roughly how many ticks fit.
 */
export function dailyTicks(buckets: readonly DayBucket[], target = 5): { t: number; label: string }[] {
  const n = buckets.length;
  const need = (n - 1) / Math.max(1, target - 1);
  const step = [1, 2, 3, 5, 7, 10, 14, 30].find((k) => k >= need * 0.85) ?? Math.ceil(need);
  const out: { t: number; label: string }[] = [];
  for (let i = n - 1; i >= 0; i -= step) out.push({ t: buckets[i].t, label: relativeDayLabel(i, n) });
  return out.reverse();
}

/** The label of a tick position, for Recharts' tickFormatter. Unknown values print nothing. */
export function tickLabelAt(ticks: readonly { t: number; label: string }[], t: number): string {
  return ticks.find((k) => k.t === t)?.label ?? '';
}

/** "Tue 12 May" for a bucket's day. */
export function dayTitle(bucket: Pick<DayBucket, 'start'>, utc = false): string {
  const dt = new Date(bucket.start + 1);
  const wd = utc ? dt.getUTCDay() : dt.getDay();
  const { m, d } = partsOf(bucket.start + 1, utc);
  return `${WEEKDAYS[wd]} ${d} ${MONTHS[m]}`;
}

/** `2026-05-12`: the day as an ISO date (hover / table). */
export function dayIso(bucket: Pick<DayBucket, 'start'>, utc = false): string {
  const { y, m, d } = partsOf(bucket.start + 1, utc);
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** "31 May 2026". */
export function formatDate(ms: number, utc = false): string {
  const { y, m, d } = partsOf(ms, utc);
  return `${d} ${MONTHS[m]} ${y}`;
}

/** Epoch ms of the newest parseable incident, or null. */
export function latestCall(incidents: readonly DailyCallIncident[]): number | null {
  let max = -Infinity;
  for (const inc of incidents) {
    const t = new Date(inc?.detected_at).getTime();
    if (Number.isFinite(t) && t > max) max = t;
  }
  return max === -Infinity ? null : max;
}

export function dailyTotals(buckets: readonly DayBucket[]): { hold: number; watch: number; note: number; total: number } {
  return buckets.reduce(
    (a, b) => ({ hold: a.hold + b.hold, watch: a.watch + b.watch, note: a.note + b.note, total: a.total + b.total }),
    { hold: 0, watch: 0, note: 0, total: 0 },
  );
}

/** `1 day` / `7 days`, for copy that follows the selected window. */
export function windowWord(days: number): string {
  const n = Math.max(1, Math.floor(toNum(days)) || 1);
  return n === 1 ? 'day' : `${n} days`;
}

/** "the last 30 days" / "today". */
export function windowPhrase(days: number): string {
  const n = Math.max(1, Math.floor(toNum(days)) || 1);
  return n === 1 ? 'today' : `the last ${n} days`;
}

/**
 * Honest empty copy. `No calls in the last 7 days.` plus, when older ones exist,
 * `Latest call: 31 May 2026.` The window in the sentence is the selected window.
 */
export function dailyEmptyText(days: number, latest: number | null, utc = false): string {
  const base = Math.floor(toNum(days)) === 1 ? 'No new calls today.' : `No new calls in ${windowPhrase(days)}.`;
  return latest === null ? base : `${base} Latest: ${formatDate(latest, utc)}.`;
}

/** Rows for the visually hidden table: days with calls only, newest first. */
export function dailyTableRows(buckets: readonly DayBucket[], utc = false): (string | number)[][] {
  return buckets
    .filter((b) => b.total > 0)
    .reverse()
    .map((b) => [`${dayTitle(b, utc)} (${dayIso(b, utc)})`, b.hold, b.watch, b.note, b.total]);
}

/** One sentence for the aria-label / sr summary. */
export function dailySummary(buckets: readonly DayBucket[], days: number, latest: number | null, utc = false): string {
  const t = dailyTotals(buckets);
  if (t.total === 0) return `Calls per day over ${windowPhrase(days)}. ${dailyEmptyText(days, latest, utc)}`;
  const busiest = buckets.reduce((a, b) => (b.total > a.total ? b : a));
  return (
    `Calls per day over ${windowPhrase(days)}: ${t.total} in total, ${t.hold} Hold, ${t.watch} Watch, ${t.note} Note. ` +
    `Busiest day ${dayTitle(busiest, utc)} with ${busiest.total}.`
  );
}

/** Tooltip row text: `1 call` / `3 calls`. */
export function callsWord(n: number): string {
  return n === 1 ? '1 call' : `${n} calls`;
}

/* ---------------------------------------------------------- Wave -- */

/** Three faint grid values for the hidden Y axis: the baseline, half, and the top. De-duplicated, ascending. */
export function waveGridTicks(yMax: number): number[] {
  const top = Math.max(1, toNum(yMax));
  return [...new Set([0, Math.round((top / 2) * 100) / 100, top])];
}

/**
 * Where the two end labels ("All 6", "Hold 3") sit vertically relative to their
 * own dots. When the two lines end within `minGap` px of each other (Hold equals
 * All is common) the labels split: All goes up, Hold goes down, so they never
 * overprint. Returns pixel offsets for the text baseline.
 */
export function headLabelOffsets(all: number, hold: number, yMax: number, plotHeight: number, minGap = 14): { all: number; hold: number } {
  const top = Math.max(1, toNum(yMax));
  const gap = (Math.max(0, toNum(all) - toNum(hold)) / top) * Math.max(0, toNum(plotHeight));
  return gap >= minGap ? { all: 4, hold: 4 } : { all: -2, hold: 12 };
}

/** Rows for the wave's table: days with calls only, newest first: Day, All calls, On Hold. */
export function waveTableRows(buckets: readonly DayBucket[], utc = false): (string | number)[][] {
  return buckets
    .filter((b) => b.total > 0)
    .reverse()
    .map((b) => [`${dayTitle(b, utc)} (${dayIso(b, utc)})`, b.total, b.hold]);
}

/** One sentence for the wave's aria summary. */
export function waveSummary(buckets: readonly DayBucket[], days: number, latest: number | null, utc = false): string {
  const t = dailyTotals(buckets);
  if (t.total === 0) return `Calls per day over ${windowPhrase(days)}. ${dailyEmptyText(days, latest, utc)}`;
  const busiest = buckets.reduce((a, b) => (b.total > a.total ? b : a));
  const calls = t.total === 1 ? '1 call' : `${t.total} calls`;
  return `Calls per day over ${windowPhrase(days)}: ${calls} in total, ${t.hold} on Hold. Busiest day ${dayTitle(busiest, utc)} with ${busiest.total}.`;
}

/* ---------------------------------------------------------- Heartbeat -- */

/** The subset of a stream event the Heartbeat reads. A SecurityEvent satisfies it. */
export interface HeartbeatEvent {
  /** Only `scan_progress` and `incident_detected` draw; everything else (publish_event, connected) is ignored. */
  type: string;
  /** Preferred: epoch ms when the browser received it (immune to server clock skew). */
  receivedAt?: number;
  /** Fallback: the server's ISO timestamp. */
  timestamp?: string | number;
  severity?: string;
}

export interface HeartbeatPoint {
  /** Epoch ms of the 1-second bucket's start. The one shared time scale. */
  t: number;
  /** Blip height of everything in this second (0 = flat). */
  v: number;
  /** Same as v but only inside the neighbourhood of a Hold-severity incident; null elsewhere so the overlay line breaks. */
  hold: number | null;
  /** Count of real events in this second. */
  n: number;
}

export const HEARTBEAT_SECONDS = 60;
/** Blip heights: a scan phase is small, an incident is large. */
export const BLIP = { scan: 1, incident: 3 } as const;

function eventTime(e: HeartbeatEvent): number {
  if (typeof e.receivedAt === 'number' && Number.isFinite(e.receivedAt)) return e.receivedAt;
  const ts = typeof e.timestamp === 'number' ? e.timestamp : new Date(e.timestamp ?? NaN).getTime();
  return Number.isFinite(ts) ? ts : NaN;
}

/** Real events inside the window only: right type, parseable time, not in the future. Nothing is invented. */
export function heartbeatEvents(events: readonly HeartbeatEvent[], now: number, seconds = HEARTBEAT_SECONDS): HeartbeatEvent[] {
  const from = now - seconds * 1000;
  return events.filter((e) => {
    if (e?.type !== 'scan_progress' && e?.type !== 'incident_detected') return false;
    const t = eventTime(e);
    return Number.isFinite(t) && t > from && t <= now + 1000;
  });
}

/**
 * The last `seconds` seconds in 1s buckets ending with the second containing
 * `now`. All zeros when nothing happened: that IS the honest flat line.
 */
export function heartbeatSeries(events: readonly HeartbeatEvent[], now: number, seconds = HEARTBEAT_SECONDS): HeartbeatPoint[] {
  const endBucket = Math.floor(now / 1000) * 1000;
  const pts: HeartbeatPoint[] = [];
  for (let i = 0; i < seconds; i++) pts.push({ t: endBucket - (seconds - 1 - i) * 1000, v: 0, hold: null, n: 0 });
  const holdAt = new Set<number>();
  for (const e of heartbeatEvents(events, now, seconds)) {
    const idx = seconds - 1 - Math.floor((endBucket - Math.floor(eventTime(e) / 1000) * 1000) / 1000);
    const i = Math.min(seconds - 1, Math.max(0, idx));
    const incident = e.type === 'incident_detected';
    pts[i].v += incident ? BLIP.incident : BLIP.scan;
    pts[i].n += 1;
    if (incident && levelOf(e.severity) === 'hold') holdAt.add(i);
  }
  for (const i of holdAt) {
    for (const j of [i - 1, i, i + 1]) if (j >= 0 && j < seconds) pts[j].hold = pts[j].v;
  }
  return pts;
}

/** "No events in the last minute." / "2 events in the last minute, 1 on Hold." */
export function heartbeatLabel(events: readonly HeartbeatEvent[], now: number, seconds = HEARTBEAT_SECONDS): string {
  const real = heartbeatEvents(events, now, seconds);
  if (real.length === 0) return 'No events in the last minute.';
  const hold = real.filter((e) => e.type === 'incident_detected' && levelOf(e.severity) === 'hold').length;
  const n = real.length === 1 ? '1 event' : `${real.length} events`;
  return `${n} in the last minute${hold ? `, ${hold} on Hold` : ''}.`;
}

/* ----------------------------------------------------- Rope (ranking) -- */

export const KNOT_MIN = 4;
export const KNOT_MAX = 8;
/** Knot radius in px: grows with risk (0 -> 4, 1 -> 8). */
export function knotRadius(risk: number): number {
  const r = Math.min(1, Math.max(0, toNum(risk)));
  return Math.round((KNOT_MIN + r * (KNOT_MAX - KNOT_MIN)) * 100) / 100;
}

/** Knot centre x inside a rope track of `width` px, kept at least one radius from either end. */
export function knotX(risk: number, width: number): number {
  const r = Math.min(1, Math.max(0, toNum(risk)));
  const k = knotRadius(r);
  const w = Math.max(0, toNum(width));
  return Math.min(Math.max(r * w, k), Math.max(k, w - k));
}

/* ------------------------------------------------------------ RiskRanking -- */

export interface RankedMaintainer {
  login: string;
  /** Coerced, clamped to 0..1. */
  risk: number;
  flagged: boolean;
  packages: number;
  commits90: number;
}

/** Coerce one row: risk may be "0.85", garbage becomes 0, values clamp into 0..1. */
export function normaliseMaintainer(m: RankingMaintainer): RankedMaintainer {
  return {
    login: String(m.login ?? ''),
    risk: Math.min(1, Math.max(0, toNum(m.risk_score))),
    flagged: m.ioc_flagged === true,
    packages: toNum(m.packages_in_graph),
    commits90: toNum(m.commits_90d),
  };
}

/** Flagged first, then highest risk; ties by packages then login so the order is stable across refreshes. */
export function rankMaintainers(list: readonly RankingMaintainer[], limit?: number): RankedMaintainer[] {
  const sorted = list
    .map(normaliseMaintainer)
    .filter((m) => m.login !== '')
    .sort(
      (a, b) =>
        Number(b.flagged) - Number(a.flagged) || b.risk - a.risk || b.packages - a.packages || a.login.localeCompare(b.login),
    );
  return limit === undefined ? sorted : sorted.slice(0, limit);
}

/** Risk to two decimals: the ONE format for bar labels, tooltip, aria and table. 0.65 stays 0.65; 1 prints 1.00. */
export function formatRisk(risk: number): string {
  return Math.min(1, Math.max(0, toNum(risk))).toFixed(2);
}

export const formatRisk2 = formatRisk;

export function rankingSummary(all: readonly RankedMaintainer[], shown: number): string {
  if (all.length === 0) return 'No people to rank yet.';
  const flagged = all.filter((m) => m.flagged).length;
  const people = all.length === 1 ? '1 person' : `${all.length} people`;
  const flagText = flagged === 0 ? 'none flagged' : `${flagged} flagged as linked to known harmful activity`;
  return `${people} publish your packages, ${flagText}. Showing the ${shown} with the highest risk. Risk runs from 0 low to 1 high.`;
}

/* ------------------------------------------------------------- Ecosystems -- */

/** True when a split is worth drawing: two or more ecosystems. One ecosystem is just the total. */
export function hasEcosystemSplit(counts: readonly { ecosystem: string; count: number }[]): boolean {
  return counts.filter((c) => c.count > 0).length >= 2;
}

/** Coerced, positive-only counts, largest first, ties alphabetical. */
export function normaliseCounts(counts: readonly EcosystemCount[]): { ecosystem: string; count: number }[] {
  const m = new Map<string, number>();
  for (const c of counts) {
    const k = c.ecosystem?.trim() || 'unknown';
    const n = Math.max(0, Math.floor(toNum(c.count)));
    if (n > 0) m.set(k, (m.get(k) ?? 0) + n);
  }
  return [...m.entries()]
    .map(([ecosystem, count]) => ({ ecosystem, count }))
    .sort((a, b) => b.count - a.count || a.ecosystem.localeCompare(b.ecosystem));
}

/** Count rows per ecosystem. Blank ecosystems count as `unknown`. */
export function countByEcosystem(rows: readonly { ecosystem: string }[]): { ecosystem: string; count: number }[] {
  return normaliseCounts(rows.map((r) => ({ ecosystem: r.ecosystem, count: 1 })));
}

/** `npm 412 · pypi 38` */
export function ecosystemLine(counts: readonly { ecosystem: string; count: number }[]): string {
  return counts.map((c) => `${c.ecosystem} ${c.count}`).join(' · ');
}

/** One row object for a stacked horizontal BarChart: { name: 'packages', npm: 412, pypi: 38 }. */
export function ecosystemStackRow(counts: readonly { ecosystem: string; count: number }[]): Record<string, number | string> {
  const row: Record<string, number | string> = { name: 'packages' };
  for (const c of counts) if (c.count > 0) row[c.ecosystem] = c.count;
  return row;
}

export type { Numeric };
export { DAY_MS };
