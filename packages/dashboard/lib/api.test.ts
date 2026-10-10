import { describe, expect, it } from 'vitest';
import health from '../test/fixtures/health.json';
import incidentsRaw from '../test/fixtures/incidents.json';
import lockfilesRaw from '../test/fixtures/lockfiles.json';
import maintainersRaw from '../test/fixtures/maintainers.json';
import statsRaw from '../test/fixtures/stats.json';
import {
  ApiError,
  describeError,
  isUnreachable,
  normaliseBlast,
  normaliseIncident,
  normalisePath,
  normaliseIncidents,
  normaliseLockfiles,
  normaliseMaintainers,
  normaliseStats,
  normaliseVeto,
  num,
} from './api';

describe('contract: real /api/maintainers/reputation payload', () => {
  it('sends risk_score as a string on the wire (the bug this boundary fixes)', () => {
    expect(typeof (maintainersRaw as { risk_score: unknown }[])[0].risk_score).toBe('string');
  });
  it('coerces every row to finite numbers', () => {
    const m = normaliseMaintainers(maintainersRaw);
    expect(m).toHaveLength(100);
    for (const x of m) {
      expect(Number.isFinite(x.risk_score)).toBe(true);
      expect(x.risk_score).toBeGreaterThanOrEqual(0);
      expect(x.risk_score).toBeLessThanOrEqual(1);
      expect(typeof x.packages_in_graph).toBe('number');
      expect(typeof x.ioc_flagged).toBe('boolean');
    }
    expect(m[0].risk_score.toFixed(1)).toBe('1.0'); // would throw on a string
  });
});

describe('contract: real /api/incidents payload', () => {
  it('normalises all four raw incidents, then de-duplicates them to one call', () => {
    expect(normaliseIncidents(incidentsRaw)).toHaveLength(1);
    const list = (incidentsRaw as unknown[]).map(normaliseIncident);
    expect(list).toHaveLength(4);
    for (const i of list) {
      expect(i.id).not.toBe('');
      expect(i.severity).toBe('CRITICAL');
      expect(typeof i.confidence).toBe('number');
      expect(Array.isArray(i.packages)).toBe(true);
      expect(Array.isArray(i.blast_radius)).toBe(true);
      expect(i.remediation_options.length).toBeGreaterThan(0);
      expect(Date.parse(i.detected_at)).not.toBeNaN();
    }
  });
  it('keeps blast-radius rows typed', () => {
    const withBlast = normaliseIncidents(incidentsRaw).find((i) => i.blast_radius.length > 0)!;
    expect(withBlast.blast_radius[0]).toMatchObject({ project_path: expect.any(String), package: expect.any(String), version: expect.any(String) });
  });
});

describe('contract: real /api/lockfiles and /api/stats payloads', () => {
  it('folds the drive-letter duplicates: 1000 raw rows are 676 real packages in one project', () => {
    expect((lockfilesRaw as unknown[]).length).toBe(1000);
    const rows = normaliseLockfiles(lockfilesRaw);
    expect(rows).toHaveLength(676);
    expect(new Set(rows.map((r) => r.project_path)).size).toBe(1);
    expect(rows[0].project_path.startsWith('C:')).toBe(true);
    expect(rows.every((r) => Array.isArray(r.parent_chain))).toBe(true);
  });
  it('reads the lockfile total from table_counts', () => {
    const s = normaliseStats(statsRaw);
    expect(s.table_counts.local_lockfiles).toBe(1352);
    expect(s.total_packages).toBe(676);
    expect(s.last_scan_at).toBeNull();
    expect(s.active_incidents.CRITICAL).toBe(4);
  });
  it('health payload is the documented shape', () => {
    expect(health).toEqual({ status: 'ok', version: '0.1.0' });
  });
});

describe('boundary never throws, whatever arrives', () => {
  it('numeric strings, junk and missing fields', () => {
    expect(num('1.00')).toBe(1);
    expect(num('abc', 7)).toBe(7);
    expect(num(null)).toBe(0);
    expect(num(Infinity)).toBe(0);
    expect(normaliseMaintainers([{ login: 'a', risk_score: 'oops' }, null, 5, {}])).toEqual([expect.objectContaining({ login: 'a', risk_score: 0 })]);
    expect(normaliseIncidents('nope')).toEqual([]);
    expect(normaliseIncidents([{ id: 'x' }])[0]).toMatchObject({ severity: 'LOW', packages: [], blast_radius: [], detected_at: '', confidence: 0 });
    expect(normaliseIncident({ id: 'x', detected_at: 'not a date' }).detected_at).toBe('');
    expect(normaliseStats(undefined).table_counts).toEqual({});
    expect(normaliseStats({ total_packages: '676' }).total_packages).toBe(676);
    expect(normaliseLockfiles([{ package: 'a', parent_chain: 'x > y' }])[0].parent_chain).toEqual(['x', 'y']);
  });
  it('blast rows from the SQL shape, and an empty answer', () => {
    const r = normaliseBlast(
      { blast_radius_entries: [{ our_project: '/p', affected_dep: 'ora', version: '1', declared_in: 'direct', parent_chain: ['a'], runtime_status: 'not_observed_at_runtime', last_runtime_load: 'never' }] },
      'm',
    );
    expect(r.blast_radius_entries[0]).toMatchObject({ project_path: '/p', package: 'ora', runtime_confirmed: false, last_runtime_load: null });
    expect(normaliseBlast({}, 'm').blast_radius_entries).toEqual([]);
  });
  it('veto: coerces and clamps', () => {
    expect(normaliseVeto({ blocked: 1, probability: '0.90', signals: ['a'] }, 'p')).toMatchObject({ blocked: true, probability: 0.9, reason: 'a', package: 'p' });
  });
});

describe('describeError is the only source of error text', () => {
  it('unreachable', () => {
    const e = new ApiError('Failed to fetch', null, '/api/incidents');
    expect(isUnreachable(e)).toBe(true);
    expect(describeError(e, 'http://localhost:8000')).toBe("We couldn't reach Crowsnest at http://localhost:8000. Is it running?");
    expect(describeError(new TypeError('Failed to fetch'))).not.toMatch(/Failed to fetch/);
  });
  it('server errors and unknowns carry no status codes or raw text', () => {
    expect(describeError(new ApiError('boom stack', 502, '/api/x'))).not.toMatch(/502|boom|stack/);
    expect(describeError(new ApiError('nope', 404, '/api/x'))).toBe("Crowsnest couldn't answer that request.");
    expect(describeError('weird')).toMatch(/Something went wrong/);
  });
});

describe('de-duplication at the boundary', () => {
  it('drive letters fold', () => {
    expect(normalisePath('c:\a\b')).toBe('C:\a\b');
    expect(normalisePath('/usr/x')).toBe('/usr/x');
  });
  it('the same call on the same day is one call; a different person is another', () => {
    const base = { attack_pattern: 'maintainer_takeover', severity: 'HIGH', packages: [], detected_at: '2026-05-31T10:00:00Z' };
    const a = { ...base, id: 'a', raw_findings: [{ login: 'Sindresorhus' }] };
    const b = { ...base, id: 'b', raw_findings: [{ login: 'sindresorhus' }], packages: ['x'] };
    const c = { ...base, id: 'c', raw_findings: [{ login: 'other' }] };
    const d = { ...a, id: 'd', detected_at: '2026-06-01T10:00:00Z' };
    const out = normaliseIncidents([a, b, c, d]);
    expect(out.map((i) => i.id).sort()).toEqual(['b', 'c', 'd']);
  });
});
