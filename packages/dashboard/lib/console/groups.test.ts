import { describe, expect, it } from 'vitest';
import { normaliseIncident } from '@/lib/api';
import incidentsJson from '@/test/fixtures/incidents.json';
import { alsoFound, groupCalls, groupKey, incidentPeople } from './groups';

const raw = (incidentsJson as unknown[]).map(normaliseIncident);

function make(over: Partial<ReturnType<typeof normaliseIncident>> & { login?: string; id: string }) {
  const base = raw[2];
  const { login, ...rest } = over;
  return {
    ...base,
    ...rest,
    raw_findings: login ? [{ login }] : base.raw_findings,
  };
}

describe('grouped Calls: the rule', () => {
  it('real payload: of four raw incidents only the two with identical packages AND people group', () => {
    // Captured from GET /api/incidents on 2026-10-08: four maintainer_takeover / CRITICAL calls.
    expect(raw).toHaveLength(4);
    const groups = groupCalls(raw);
    // Three distinct problems: an empty one, one with a different package set, and one pair that is identical.
    expect(groups).toHaveLength(3);
    const sizes = groups.map((g) => 1 + g.others.length).sort();
    expect(sizes).toEqual([1, 1, 2]);
    const pair = groups.find((g) => g.others.length === 1)!;
    expect(groupKey(pair.lead)).toBe(groupKey(pair.others[0]));
  });

  it('never merges calls with a different package set, even for the same person and pattern', () => {
    const a = make({ id: 'a', packages: ['left-pad', 'ora'], login: 'sam' });
    const b = make({ id: 'b', packages: ['left-pad', 'ora', 'conf'], login: 'sam' });
    expect(groupCalls([a, b])).toHaveLength(2);
  });

  it('never merges calls about different people, even with the same packages', () => {
    const a = make({ id: 'a', packages: ['ora'], login: 'sam' });
    const b = make({ id: 'b', packages: ['ora'], login: 'robin' });
    expect(groupCalls([a, b])).toHaveLength(2);
  });

  it('never merges a different kind of call or a different seriousness', () => {
    const a = make({ id: 'a', packages: ['ora'], login: 'sam' });
    expect(groupCalls([a, { ...a, id: 'b', attack_pattern: 'worm' }])).toHaveLength(2);
    expect(groupCalls([a, { ...a, id: 'c', severity: 'MEDIUM' }])).toHaveLength(2);
  });

  it('merges only when all of them match, and ignores order and letter case', () => {
    const a = make({ id: 'a', packages: ['ora', 'conf'], login: 'Sam' });
    const b = make({ id: 'b', packages: ['CONF', 'ora'], login: 'sam' });
    const groups = groupCalls([a, b]);
    expect(groups).toHaveLength(1);
    expect(groups[0].others).toHaveLength(1);
  });

  it('lists every person named in the findings, not only the first', () => {
    expect(incidentPeople({ raw_findings: [{ login: 'b' }, { maintainer: 'A' }, { login: 'b' }] })).toEqual(['a', 'b']);
    const a = make({ id: 'a', packages: ['x'] });
    const b = { ...a, id: 'b', raw_findings: [{ login: 'sam' }, { login: 'robin' }] };
    const c = { ...a, id: 'c', raw_findings: [{ login: 'sam' }] };
    expect(groupCalls([b, c])).toHaveLength(2);
  });

  it('keeps the newest as the card and the rest behind it', () => {
    const old = make({ id: 'old', packages: ['ora'], login: 'sam', detected_at: '2026-05-01T10:00:00Z' });
    const mid = make({ id: 'mid', packages: ['ora'], login: 'sam', detected_at: '2026-05-10T10:00:00Z' });
    const now = make({ id: 'new', packages: ['ora'], login: 'sam', detected_at: '2026-05-20T10:00:00Z' });
    const [g] = groupCalls([old, now, mid]);
    expect(g.lead.id).toBe('new');
    expect(g.others.map((i) => i.id)).toEqual(['mid', 'old']);
  });

  it('prints the count in plain words', () => {
    expect(alsoFound(1)).toBe('Also found 1 more time.');
    expect(alsoFound(2)).toBe('Also found 2 more times.');
  });
});
