import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DailyCalls, DailyWave } from './DailyCalls';
import { EcosystemBar } from './EcosystemBar';
import { Heartbeat, HeartbeatTrace } from './Heartbeat';
import { RiskRanking } from './RiskRanking';
import { dailyBuckets, dailyDomain, heartbeatSeries } from './transforms';

const NOW = Date.parse('2026-10-07T15:30:00Z');
const err = { what: "We couldn't reach Crowsnest at http://localhost:8000. Is it running?", help: { href: '/docs/troubleshooting', label: 'How to start it →' } };
const inc = (severity: string, at: string) => ({ severity, detected_at: at });

/** Wave geometry in the fixed-size render: the Y axis is hidden (width 0), margin right 60. */
const W = 700;
const H = 200;
const LEFT = 0;
const RIGHT = 60;

const heads = (c: HTMLElement) =>
  [...c.querySelectorAll('[data-testid="wave-head"]')].map((g) => {
    const dot = g.querySelectorAll('circle');
    const solid = dot[dot.length - 1];
    return { cx: Number(solid.getAttribute('cx')), cy: Number(solid.getAttribute('cy')), text: g.querySelector('text')?.textContent ?? '' };
  });

describe('DailyWave plot positions', () => {
  const incidents = [
    inc('CRITICAL', '2026-10-07T01:00:00Z'), // today
    inc('HIGH', '2026-10-07T09:00:00Z'), // today
    inc('MEDIUM', '2026-09-30T12:00:00Z'), // 7 days ago
    inc('LOW', '2026-09-08T08:00:00Z'), // oldest day
  ];
  const buckets = dailyBuckets(incidents, 30, NOW, true);
  const [lo, hi] = dailyDomain(buckets);
  const plotW = W - LEFT - RIGHT;
  const xOf = (t: number) => LEFT + ((t - lo) / (hi - lo)) * plotW;
  const mount = (live = true) => render(<DailyWave buckets={buckets} utc live={live} width={W} height={H} />).container;

  it('draws two monotone curves and puts the live heads at the latest point on the shared time scale', () => {
    const c = mount();
    expect(c.querySelectorAll('.recharts-area-curve')).toHaveLength(2);
    const h = heads(c);
    expect(h).toHaveLength(2);
    expect(h[0].cx).toBeCloseTo(xOf(buckets[29].t), 0);
    expect(h[1].cx).toBeCloseTo(xOf(buckets[29].t), 0);
    expect(h[0].text).toBe('All 2');
    expect(h[1].text).toBe('Hold 2');
    // All equals Hold today, so the dots coincide and the labels split instead of overprinting.
    expect(h[0].cy).toBeCloseTo(h[1].cy, 0);
    const ys = [...c.querySelectorAll('[data-testid="wave-head"] text')].map((t) => Number(t.getAttribute('y')));
    expect(Math.abs(ys[0] - ys[1])).toBeGreaterThanOrEqual(12);
  });

  it('uses a smooth cubic path that never dips below the baseline', () => {
    const c = mount();
    const all = c.querySelectorAll('.recharts-area-curve')[0].getAttribute('d') ?? '';
    expect(all).toContain('C');
    const nums = (all.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    const ys = nums.filter((_, i) => i % 2 === 1);
    const baseY = Math.max(...[...c.querySelectorAll('.recharts-cartesian-grid-horizontal line')].map((l) => Number(l.getAttribute('y1'))));
    expect(Math.max(...ys)).toBeLessThanOrEqual(baseY + 0.5);
  });

  it('puts the tick labels under the points they name', () => {
    const c = mount();
    const ticks = [...c.querySelectorAll<SVGTextElement>('.recharts-xAxis text.recharts-cartesian-axis-tick-value')];
    const today = ticks.find((t) => t.textContent === 'Today');
    const weekAgo = ticks.find((t) => t.textContent === '7 days ago');
    expect(Number(today!.getAttribute('x'))).toBeCloseTo(xOf(buckets[29].t), 0);
    expect(Number(weekAgo!.getAttribute('x'))).toBeCloseTo(xOf(buckets[22].t), 0);
  });

  it('prints no stray count text: only the two end labels and axis ticks', () => {
    const c = mount();
    const texts = [...c.querySelectorAll('svg text')].map((t) => t.textContent ?? '');
    expect(texts.filter((t) => /^\d+$/.test(t))).toHaveLength(0);
    expect(texts.filter((t) => /^(All|Hold) \d+$/.test(t))).toHaveLength(2);
  });

  it('offline: a static ring and no ripple', () => {
    const c = mount(false);
    expect(c.querySelector('.cn-ripple')).toBeNull();
    expect(c.querySelectorAll('.cn-ring-static')).toHaveLength(2);
  });

  it('live: the head carries a ripple ring', () => {
    expect(mount(true).querySelectorAll('.cn-ripple')).toHaveLength(2);
  });

  it('spark variant has one series, no axis and no labels', () => {
    const { container } = render(<DailyWave buckets={buckets} utc variant="spark" width={W} height={48} />);
    expect(container.querySelectorAll('.recharts-area-curve')).toHaveLength(1);
    expect(container.querySelector('.recharts-xAxis')).toBeNull();
    expect(container.querySelector('svg text')).toBeNull();
  });
});

describe('DailyCalls', () => {
  it('is a labelled figure with summary, hidden table and a 44px view-as-table toggle', () => {
    render(<DailyCalls now={NOW} utc incidents={[inc('HIGH', '2026-10-05T10:00:00Z'), inc('LOW', '2026-10-05T11:00:00Z')]} />);
    const fig = screen.getByRole('figure', { name: 'Calls per day over the last 30 days.' });
    expect(within(fig).getByText(/2 calls in total, 1 on Hold/)).toBeInTheDocument();
    expect(within(fig).getByRole('table', { hidden: true })).toBeInTheDocument();
    const toggle = within(fig).getByRole('button', { name: 'View as table' });
    expect(toggle.className).toContain('min-h-[2.75rem]');
    fireEvent.click(toggle);
    expect(within(fig).getByRole('table')).toBeVisible();
    expect(within(fig).getByText('Mon 5 Oct (2026-10-05)')).toBeInTheDocument();
    expect(within(fig).getByRole('columnheader', { name: 'On Hold' })).toBeInTheDocument();
    expect(within(fig).getByRole('button', { name: 'View as chart' })).toBeInTheDocument();
  });

  it('has no legend: direct labels live in the plot', () => {
    render(<DailyCalls now={NOW} utc incidents={[inc('HIGH', '2026-10-05T10:00:00Z')]} />);
    expect(screen.queryByTestId('daily-labels')).toBeNull();
    expect(document.querySelector('.recharts-legend-wrapper')).toBeNull();
  });

  it('empty state names the selected window and the latest call', () => {
    const old = [inc('HIGH', '2026-05-31T10:00:00Z')];
    const { rerender } = render(<DailyCalls now={NOW} utc incidents={old} days={30} />);
    expect(screen.getByText('No new calls in the last 30 days. Latest: 31 May 2026.')).toBeInTheDocument();
    rerender(<DailyCalls now={NOW} utc incidents={old} days={7} />);
    expect(screen.getByText('No new calls in the last 7 days. Latest: 31 May 2026.')).toBeInTheDocument();
    expect(screen.queryByRole('figure')).toBeNull();
    rerender(<DailyCalls now={NOW} utc incidents={[]} days={90} />);
    expect(screen.getByText('No new calls in the last 90 days.')).toBeInTheDocument();
  });

  it('empty state renders the adornment slot beside the sentence, and nothing without it', () => {
    const { rerender } = render(<DailyCalls now={NOW} utc incidents={[]} emptyAdornment={<span data-testid="cameo">nib</span>} />);
    expect(screen.getByTestId('cameo')).toBeInTheDocument();
    rerender(<DailyCalls now={NOW} utc incidents={[]} />);
    expect(screen.queryByTestId('cameo')).toBeNull();
  });

  it('shows a loading status and a plain error with retry', () => {
    const { rerender } = render(<DailyCalls now={NOW} incidents={[]} loading />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading calls per day.');
    const retry = vi.fn();
    rerender(<DailyCalls now={NOW} incidents={[]} error={err} onRetry={retry} />);
    expect(screen.getByRole('alert')).toHaveTextContent("We couldn't reach Crowsnest");
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }));
    expect(retry).toHaveBeenCalled();
    expect(screen.queryByRole('figure')).toBeNull();
  });
});

describe('Heartbeat', () => {
  const T = Date.parse('2026-10-07T15:30:30.400Z');
  const ev = (type: string, agoMs: number, extra: object = {}) => ({ type, receivedAt: T - agoMs, ...extra });

  it('is flat with a head when nothing happened, and says so', () => {
    render(<Heartbeat now={T} events={[{ type: 'publish_event', receivedAt: T - 500 }, { type: 'connected', receivedAt: T }]} />);
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'No events in the last minute.');
    const pts = heartbeatSeries([{ type: 'publish_event', receivedAt: T }], T);
    expect(pts.every((p) => p.v === 0 && p.hold === null)).toBe(true);
    expect(document.querySelector('[data-testid="heartbeat-head"]')).not.toBeNull();
  });

  it('counts only real scan and incident events in the last minute', () => {
    render(
      <Heartbeat
        now={T}
        events={[
          ev('scan_progress', 5000),
          ev('incident_detected', 2000, { severity: 'CRITICAL' }),
          ev('scan_progress', 90_000),
          ev('publish_event', 1000),
        ]}
      />,
    );
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', '2 events in the last minute, 1 on Hold.');
  });

  it('offline: dashed muted line, no ripple, and the label says Offline', () => {
    const { container } = render(<Heartbeat now={T} live={false} events={[]} />);
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'Offline. No events in the last minute.');
    expect(container.querySelector('.cn-ripple')).toBeNull();
    expect(container.querySelector('.recharts-line-curve')?.getAttribute('stroke-dasharray')).toBe('3 3');
  });

  it('draws the Hold overlay line only when live', () => {
    const pts = heartbeatSeries([ev('scan_progress', 10_000), ev('incident_detected', 1000, { severity: 'HIGH' })], T);
    const { container } = render(<HeartbeatTrace points={pts} live width={160} height={28} />);
    expect(container.querySelectorAll('.recharts-line-curve')).toHaveLength(2);
    expect(Math.max(...pts.map((p) => p.v))).toBe(3);
  });
});

describe('RiskRanking', () => {
  const people = [
    { login: 'alice', risk_score: '0.40', ioc_flagged: false, packages_in_graph: '3', commits_90d: 12 },
    { login: 'mallory', risk_score: 0.9, ioc_flagged: true, packages_in_graph: 1, commits_90d: 0 },
    { login: 'bob', risk_score: '1.00', ioc_flagged: false },
  ];

  it('ranks flagged first, prints plain flagged text, and is a keyboard listbox', () => {
    const onSelect = vi.fn();
    render(<RiskRanking maintainers={people} onSelect={onSelect} />);
    const list = screen.getByRole('listbox');
    const options = within(list).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['mallory' + 'Flagged', 'bob', 'alice']);
    expect(options[0]).toHaveAttribute('aria-label', expect.stringContaining('Flagged: linked to known harmful activity'));
    expect(screen.getByText('Risk, 0 low to 1 high')).toBeInTheDocument();
    options[0].focus();
    fireEvent.keyDown(options[0], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(options[1]);
    fireEvent.keyDown(options[1], { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('bob');
    fireEvent.keyDown(options[1], { key: 'End' });
    expect(document.activeElement).toBe(options[2]);
  });

  it('has a table with two-decimal risk and a toggle', () => {
    render(<RiskRanking maintainers={people} />);
    const fig = screen.getByRole('figure', { name: /People who publish your packages/ });
    fireEvent.click(within(fig).getByRole('button', { name: 'View as table' }));
    const table = within(fig).getByRole('table');
    expect(within(table).getByText('1.00')).toBeInTheDocument();
    expect(within(table).getByText('0.40')).toBeInTheDocument();
    expect(within(table).getAllByText('Flagged').length).toBe(2);
  });

  it('uses one rounding everywhere: 0.65 is 0.65 in bars, aria and table', () => {
    const { container } = render(<RiskRanking maintainers={[{ login: 'x', risk_score: 0.65, ioc_flagged: false }, { login: 'y', risk_score: 0.7, ioc_flagged: false }]} />);
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-label', expect.stringContaining('risk 0.70 of 1'));
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-label', expect.stringContaining('risk 0.65 of 1'));
    expect(container.textContent).not.toMatch(/\b0\.7\b/);
  });

  it('limits to ten and shows all on request', () => {
    const many = Array.from({ length: 14 }, (_, i) => ({ login: `p${i}`, risk_score: i / 20, ioc_flagged: false }));
    render(<RiskRanking maintainers={many} />);
    expect(screen.getAllByRole('option')).toHaveLength(10);
    fireEvent.click(screen.getByRole('button', { name: 'Show all (14)' }));
    expect(screen.getAllByRole('option')).toHaveLength(14);
  });

  it('empty, loading and error states are plain', () => {
    const { rerender } = render(<RiskRanking maintainers={[]} />);
    expect(screen.getByText('No publishers to show yet. Scan a project to see who maintains your packages.')).toBeInTheDocument();
    rerender(<RiskRanking maintainers={[]} loading />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    rerender(<RiskRanking maintainers={[]} error={err} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

describe('EcosystemBar', () => {
  it('prints direct labels and a table, coercing string counts', () => {
    render(<EcosystemBar counts={[{ ecosystem: 'npm', count: '412' }, { ecosystem: 'pypi', count: 38 }]} />);
    const fig = screen.getByRole('figure', { name: 'Packages by ecosystem.' });
    expect(within(fig).getByText(/450 packages: npm 412 · pypi 38/)).toBeInTheDocument();
    expect(within(fig).getByRole('table', { hidden: true })).toBeInTheDocument();
  });

  it('renders nothing for a single ecosystem', () => {
    const { container } = render(<EcosystemBar counts={[{ ecosystem: 'npm', count: 1000 }]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('empty state is honest', () => {
    render(<EcosystemBar rows={[]} />);
    expect(screen.getByText(/No packages to split by ecosystem/)).toBeInTheDocument();
  });
});
