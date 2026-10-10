import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RankingBars } from './RiskRanking';
import {
  BLIP,
  dailyBuckets,
  headLabelOffsets,
  heartbeatEvents,
  heartbeatLabel,
  heartbeatSeries,
  knotRadius,
  knotX,
  rankMaintainers,
  waveGridTicks,
  waveSummary,
  waveTableRows,
} from './transforms';

const NOW = Date.parse('2026-10-07T15:30:00Z');
const inc = (severity: string, at: string) => ({ severity, detected_at: at });

describe('wave transforms', () => {
  const b = dailyBuckets(
    [inc('HIGH', '2026-10-05T10:00:00Z'), inc('LOW', '2026-10-05T11:00:00Z'), inc('CRITICAL', '2026-10-07T01:00:00Z')],
    30,
    NOW,
    true,
  );

  it('zero-fills 30 days and keeps Hold at or below All', () => {
    expect(b).toHaveLength(30);
    expect(b.filter((d) => d.total === 0)).toHaveLength(28);
    expect(b.every((d) => d.hold <= d.total)).toBe(true);
  });

  it('grid ticks: baseline, half and top, ascending, unique', () => {
    expect(waveGridTicks(3)).toEqual([0, 1.5, 3]);
    expect(waveGridTicks(1)).toEqual([0, 0.5, 1]);
    expect(waveGridTicks(0)).toEqual([0, 0.5, 1]);
  });

  it('splits the end labels only when the lines end close together', () => {
    expect(headLabelOffsets(6, 6, 6, 160)).toEqual({ all: -2, hold: 12 });
    expect(headLabelOffsets(6, 0, 6, 160)).toEqual({ all: 4, hold: 4 });
    expect(headLabelOffsets('6' as unknown as number, '5.9' as unknown as number, 6, 160)).toEqual({ all: -2, hold: 12 });
  });

  it('table rows and summary use All calls and On Hold, newest first', () => {
    expect(waveTableRows(b, true)).toEqual([
      ['Wed 7 Oct (2026-10-07)', 1, 1],
      ['Mon 5 Oct (2026-10-05)', 2, 1],
    ]);
    expect(waveSummary(b, 30, null, true)).toBe(
      'Calls per day over the last 30 days: 3 calls in total, 2 on Hold. Busiest day Mon 5 Oct with 2.',
    );
    expect(waveSummary(dailyBuckets([], 7, NOW, true), 7, null, true)).toContain('No new calls in the last 7 days.');
  });
});

describe('heartbeat transforms', () => {
  const T = Date.parse('2026-10-07T15:30:30.400Z');
  const at = (agoMs: number, type: string, extra: object = {}) => ({ type, receivedAt: T - agoMs, ...extra });

  it('is 60 one-second buckets on one time scale, all zero when nothing happened', () => {
    const pts = heartbeatSeries([], T);
    expect(pts).toHaveLength(60);
    expect(pts[59].t).toBe(Math.floor(T / 1000) * 1000);
    expect(pts[1].t - pts[0].t).toBe(1000);
    expect(pts.every((p) => p.v === 0 && p.n === 0 && p.hold === null)).toBe(true);
  });

  it('ignores publish_event, connected, old, future and unparseable events', () => {
    const real = heartbeatEvents(
      [
        at(0, 'publish_event'),
        at(0, 'connected'),
        at(61_000, 'scan_progress'),
        at(-5000, 'scan_progress'),
        { type: 'scan_progress', timestamp: 'not a date' },
        at(3000, 'scan_progress'),
      ],
      T,
    );
    expect(real).toHaveLength(1);
  });

  it('places a scan blip small and an incident blip large at the second it arrived', () => {
    const pts = heartbeatSeries([at(10_300, 'scan_progress'), at(2300, 'incident_detected', { severity: 'LOW' })], T);
    const scan = pts.findIndex((p) => p.v === BLIP.scan);
    const inc2 = pts.findIndex((p) => p.v === BLIP.incident);
    expect(scan).toBe(49);
    expect(inc2).toBe(57);
    expect(pts[inc2].hold).toBeNull();
  });

  it('colours only HIGH and CRITICAL incidents Hold, with a neighbourhood so the overlay line has shape', () => {
    const pts = heartbeatSeries([at(1300, 'incident_detected', { severity: 'CRITICAL' })], T);
    const i = pts.findIndex((p) => p.v === BLIP.incident);
    expect([pts[i - 1].hold, pts[i].hold, pts[i + 1].hold]).toEqual([0, BLIP.incident, 0]);
    expect(pts.filter((p) => p.hold !== null)).toHaveLength(3);
  });

  it('adds up several events in the same second and falls back to the server timestamp', () => {
    const iso = new Date(T - 1500).toISOString();
    const pts = heartbeatSeries([{ type: 'scan_progress', timestamp: iso }, { type: 'scan_progress', timestamp: iso }], T);
    expect(Math.max(...pts.map((p) => p.v))).toBe(2);
    expect(Math.max(...pts.map((p) => p.n))).toBe(2);
  });

  it('labels the last minute in plain words', () => {
    expect(heartbeatLabel([], T)).toBe('No events in the last minute.');
    expect(heartbeatLabel([at(1000, 'scan_progress')], T)).toBe('1 event in the last minute.');
    expect(heartbeatLabel([at(1000, 'scan_progress'), at(500, 'incident_detected', { severity: 'HIGH' })], T)).toBe(
      '2 events in the last minute, 1 on Hold.',
    );
  });
});

describe('rope transforms', () => {
  it('knot size and position follow risk, clamped inside the rope', () => {
    expect(knotRadius(0)).toBe(4);
    expect(knotRadius(1)).toBe(8);
    expect(knotRadius('0.5' as unknown as number)).toBe(6);
    expect(knotX(0, 200)).toBe(4);
    expect(knotX(0.5, 200)).toBe(100);
    expect(knotX(1, 200)).toBe(192);
  });
});

describe('RankingBars (ropes)', () => {
  const people = rankMaintainers([
    { login: 'mallory', risk_score: '0.9', ioc_flagged: true },
    { login: 'alice', risk_score: 0.4, ioc_flagged: false },
    { login: 'bob', risk_score: 0.655, ioc_flagged: false },
  ]);

  it('draws one rope per person, knots placed and sized by risk, two-decimal values', () => {
    const { container } = render(<RankingBars data={people} animate={false} width={400} height={96} />);
    const ropes = [...container.querySelectorAll('[data-testid="rope"]')];
    expect(ropes).toHaveLength(3);
    const knots = ropes.map((g) => {
      const c = g.querySelectorAll('circle');
      const k = c[c.length - 1];
      return { r: Number(k.getAttribute('r')), cx: Number(k.getAttribute('cx')), fill: k.getAttribute('fill') };
    });
    expect(knots[0].fill).toBe('var(--c-hold)');
    expect(knots[1].fill).toBe('var(--c-brand)');
    // ranked: mallory 0.90, bob 0.66, alice 0.40
    expect(knots[0].r).toBeGreaterThan(knots[2].r);
    expect(knots[0].cx).toBeGreaterThan(knots[1].cx);
    expect(knots[1].cx).toBeGreaterThan(knots[2].cx);
    const labels = ropes.map((g) => g.querySelector('text')!.textContent);
    expect(labels).toEqual(['0.90', '0.66', '0.40']);
  });
});
