import { describe, expect, it } from 'vitest';
import {
  countByEcosystem,
  dailyBuckets,
  dailyDomain,
  dailyEmptyText,
  dailySummary,
  dailyTableRows,
  dailyTicks,
  dailyYMax,
  dayIso,
  dayStart,
  dayTitle,
  ecosystemLine,
  formatDate,
  formatRisk,
  latestCall,
  levelOf,
  normaliseCounts,
  hasEcosystemSplit,
  rankMaintainers,
  relativeDayLabel,
  tickLabelAt,
  toNum,
  windowPhrase,
} from './transforms';

const NOW = Date.parse('2026-10-07T15:30:00Z');
const DAY = 86_400_000;
const inc = (severity: string, at: string) => ({ severity, detected_at: at });

describe('toNum', () => {
  it('coerces strings and rejects garbage', () => {
    expect(toNum('1.00')).toBe(1);
    expect(toNum(' 0.85 ')).toBe(0.85);
    expect(toNum(3)).toBe(3);
    expect(toNum('')).toBe(0);
    expect(toNum('abc')).toBe(0);
    expect(toNum(null)).toBe(0);
    expect(toNum(undefined)).toBe(0);
    expect(toNum(NaN)).toBe(0);
    expect(toNum(Infinity)).toBe(0);
  });
});

describe('levelOf', () => {
  it('matches the Gauge mapping', () => {
    expect(levelOf('CRITICAL')).toBe('hold');
    expect(levelOf('HIGH')).toBe('hold');
    expect(levelOf('high')).toBe('hold');
    expect(levelOf('MEDIUM')).toBe('watch');
    expect(levelOf('LOW')).toBe('note');
    expect(levelOf('nonsense')).toBe('note');
    expect(levelOf(undefined)).toBe('note');
  });
});

describe('dailyBuckets (UTC)', () => {
  it('returns one bucket per day, ending with the day of now, with no gaps', () => {
    const b = dailyBuckets([], 30, NOW, true);
    expect(b).toHaveLength(30);
    expect(b[29].start).toBe(Date.UTC(2026, 9, 7));
    expect(b[0].start).toBe(Date.UTC(2026, 9, 7) - 29 * DAY);
    for (let i = 1; i < b.length; i++) expect(b[i].start - b[i - 1].start).toBe(DAY);
  });

  it('puts each bucket position t at the middle of its day, inside [start, end)', () => {
    const b = dailyBuckets([], 7, NOW, true);
    for (const x of b) {
      expect(x.t).toBe(x.start + DAY / 2);
      expect(x.t).toBeGreaterThan(x.start);
      expect(x.t).toBeLessThan(x.end);
    }
  });

  it('places incidents at known times in the right bucket, by seriousness', () => {
    const b = dailyBuckets(
      [
        inc('CRITICAL', '2026-10-07T00:00:00Z'), // first instant of today
        inc('HIGH', '2026-10-07T14:00:00Z'),
        inc('MEDIUM', '2026-10-06T23:59:59Z'), // last second of yesterday
        inc('LOW', '2026-09-08T12:00:00Z'), // oldest day of a 30 day window
        inc('LOW', '2026-09-07T23:59:59Z'), // one second before the window: dropped
        inc('HIGH', '2026-10-08T00:00:00Z'), // tomorrow: dropped
        inc('HIGH', 'not a date'), // dropped
      ],
      30,
      NOW,
      true,
    );
    expect(b[29]).toMatchObject({ hold: 2, watch: 0, note: 0, total: 2 });
    expect(b[28]).toMatchObject({ hold: 0, watch: 1, note: 0, total: 1 });
    expect(b[0]).toMatchObject({ hold: 0, watch: 0, note: 1, total: 1 });
    expect(b.reduce((a, x) => a + x.total, 0)).toBe(4);
  });

  it('the domain is first midnight to the end of the last day, and every t lies inside it', () => {
    const b = dailyBuckets([], 30, NOW, true);
    const [lo, hi] = dailyDomain(b);
    expect(lo).toBe(b[0].start);
    expect(hi).toBe(Date.UTC(2026, 9, 8));
    for (const x of b) {
      expect(x.t).toBeGreaterThan(lo);
      expect(x.t).toBeLessThan(hi);
    }
  });

  it('follows the selected window', () => {
    expect(dailyBuckets([], 7, NOW, true)).toHaveLength(7);
    expect(dailyBuckets([], 90, NOW, true)).toHaveLength(90);
    expect(dailyBuckets([], 0, NOW, true)).toHaveLength(1);
  });

  it('coerces a string window', () => {
    expect(dailyBuckets([], '7' as unknown as number, NOW, true)).toHaveLength(7);
  });
});

describe('daily helpers', () => {
  const b = dailyBuckets([inc('HIGH', '2026-10-05T10:00:00Z')], 30, NOW, true);

  it('ticks are bucket positions, newest is Today, spaced evenly, relative labels', () => {
    const ticks = dailyTicks(b, 5);
    expect(ticks[ticks.length - 1]).toEqual({ t: b[29].t, label: 'Today' });
    expect(ticks.map((t) => t.label)).toEqual(['28 days ago', '21 days ago', '14 days ago', '7 days ago', 'Today']);
    for (let i = 1; i < ticks.length; i++) expect(ticks[i].t - ticks[i - 1].t).toBe(7 * DAY);
    // Every tick sits exactly on a bucket (so it lines up under a bar).
    for (const t of ticks) expect(b.some((x) => x.t === t.t)).toBe(true);
    expect(tickLabelAt(ticks, b[29].t)).toBe('Today');
    expect(tickLabelAt(ticks, 123)).toBe('');
  });

  it('relative labels', () => {
    expect(relativeDayLabel(29, 30)).toBe('Today');
    expect(relativeDayLabel(28, 30)).toBe('Yesterday');
    expect(relativeDayLabel(0, 30)).toBe('29 days ago');
  });

  it('y max is at least 3 and tracks the busiest day', () => {
    expect(dailyYMax(b)).toBe(3);
    const busy = dailyBuckets(Array.from({ length: 9 }, () => inc('LOW', '2026-10-07T01:00:00Z')), 7, NOW, true);
    expect(dailyYMax(busy)).toBe(9);
  });

  it('titles and ISO dates are the bucket day', () => {
    expect(dayTitle(b[27], true)).toBe('Mon 5 Oct');
    expect(dayIso(b[27], true)).toBe('2026-10-05');
    expect(formatDate(Date.parse('2026-05-31T10:00:00Z'), true)).toBe('31 May 2026');
  });

  it('table rows list days with calls, newest first, with ISO date', () => {
    expect(dailyTableRows(b, true)).toEqual([['Mon 5 Oct (2026-10-05)', 1, 0, 0, 1]]);
  });

  it('latestCall ignores bad times', () => {
    expect(latestCall([])).toBeNull();
    expect(latestCall([inc('LOW', 'x'), inc('LOW', '2026-05-31T00:00:00Z'), inc('LOW', '2026-05-30T00:00:00Z')])).toBe(
      Date.parse('2026-05-31T00:00:00Z'),
    );
  });

  it('empty text follows the selected window and names the latest call', () => {
    const latest = Date.parse('2026-05-31T10:00:00Z');
    expect(dailyEmptyText(30, null, true)).toBe('No new calls in the last 30 days.');
    expect(dailyEmptyText(7, null, true)).toBe('No new calls in the last 7 days.');
    expect(dailyEmptyText(90, latest, true)).toBe('No new calls in the last 90 days. Latest: 31 May 2026.');
    expect(dailyEmptyText(1, null, true)).toBe('No new calls today.');
    expect(windowPhrase(14)).toBe('the last 14 days');
  });

  it('summary is one sentence about the window', () => {
    expect(dailySummary(b, 30, null, true)).toContain('over the last 30 days: 1 in total, 1 Hold, 0 Watch, 0 Note');
    const none = dailyBuckets([], 7, NOW, true);
    expect(dailySummary(none, 7, null, true)).toContain('No new calls in the last 7 days.');
  });
});

describe('local-time days are DST-safe', () => {
  it('consecutive local day starts are distinct and ascending, and t sits inside each day', () => {
    const b = dailyBuckets([], 30, NOW, false);
    for (let i = 1; i < b.length; i++) expect(b[i].start).toBeGreaterThan(b[i - 1].start);
    for (const x of b) {
      expect(x.t).toBeGreaterThan(x.start);
      expect(x.t).toBeLessThan(x.end);
    }
    expect(dayStart(NOW, 0, false)).toBe(b[29].start);
  });
});

describe('rankMaintainers', () => {
  it('coerces string risk, clamps, and sorts flagged first then risk desc, stable ties', () => {
    const r = rankMaintainers([
      { login: 'b', risk_score: '0.50', ioc_flagged: false },
      { login: 'a', risk_score: 0.5, ioc_flagged: false },
      { login: 'low', risk_score: 'oops', ioc_flagged: false },
      { login: 'flagged', risk_score: '0.1', ioc_flagged: true },
      { login: 'hi', risk_score: '1.00', ioc_flagged: false },
      { login: 'over', risk_score: 7, ioc_flagged: false },
    ]);
    expect(r.map((m) => m.login)).toEqual(['flagged', 'hi', 'over', 'a', 'b', 'low']);
    expect(r.find((m) => m.login === 'hi')!.risk).toBe(1);
    expect(r.find((m) => m.login === 'over')!.risk).toBe(1);
    expect(r.find((m) => m.login === 'low')!.risk).toBe(0);
  });

  it('limits, and prints risk to two decimals', () => {
    const list = Array.from({ length: 20 }, (_, i) => ({ login: `u${i}`, risk_score: i / 20, ioc_flagged: false }));
    expect(rankMaintainers(list, 10)).toHaveLength(10);
    expect(formatRisk(0.65)).toBe('0.65');
    expect(formatRisk(1)).toBe('1.00');
    expect(formatRisk(NaN)).toBe('0.00');
  });
});

describe('ecosystems', () => {
  it('counts, coerces, sorts', () => {
    expect(countByEcosystem([{ ecosystem: 'pypi' }, { ecosystem: 'npm' }, { ecosystem: 'npm' }, { ecosystem: ' ' }])).toEqual([
      { ecosystem: 'npm', count: 2 },
      { ecosystem: 'pypi', count: 1 },
      { ecosystem: 'unknown', count: 1 },
    ]);
    const n = normaliseCounts([
      { ecosystem: 'npm', count: '412' },
      { ecosystem: 'pypi', count: 38 },
      { ecosystem: 'go', count: 0 },
    ]);
    expect(ecosystemLine(n)).toBe('npm 412 · pypi 38');
  });
});

describe('hasEcosystemSplit', () => {
  it('needs two ecosystems', () => {
    expect(hasEcosystemSplit([{ ecosystem: 'npm', count: 1000 }])).toBe(false);
    expect(hasEcosystemSplit([{ ecosystem: 'npm', count: 9 }, { ecosystem: 'pypi', count: 1 }])).toBe(true);
    expect(hasEcosystemSplit([])).toBe(false);
  });
});
