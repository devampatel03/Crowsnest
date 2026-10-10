/** Plain relative times (02-copy 9.1). Absolute ISO goes in a `title`, never in primary text. */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** `12 May 2026`, in the viewer's time zone. '' for unparseable input. */
export function fullDate(ts: string | number | Date): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * just now, 5 minutes ago, an hour ago, 3 hours ago, yesterday, 3 days ago;
 * older than 30 days is a date. Future times (clock skew) read as "just now".
 */
export function timeAgo(ts: string | number | Date, now: number = Date.now()): string {
  const t = new Date(ts).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Math.max(0, now - t);
  if (diff < MIN) return 'just now';
  if (diff < HOUR) {
    const m = Math.floor(diff / MIN);
    return m === 1 ? 'a minute ago' : `${m} minutes ago`;
  }
  if (diff < DAY) {
    const h = Math.floor(diff / HOUR);
    return h === 1 ? 'an hour ago' : `${h} hours ago`;
  }
  if (diff < 2 * DAY) return 'yesterday';
  if (diff <= 30 * DAY) return `${Math.floor(diff / DAY)} days ago`;
  return fullDate(t);
}

/** `2:14 pm` in the viewer's time zone. '' for unparseable input. */
export function clockTime(ts: string | number | Date): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(/\s/g, ' ').toLowerCase();
}

/** Absolute time for a `title` attribute: ISO, seconds precision, UTC. */
export function isoTitle(ts: string | number | Date): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** `1,352`. */
export function count(n: number): string {
  return n.toLocaleString('en-US');
}

/** `1 Jun 2026`. */
export function shortDate(ts: string | number | Date): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).replace('Sept', 'Sep');
}
