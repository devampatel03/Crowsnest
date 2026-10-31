import { describe, expect, it } from 'vitest';
import { assessRelease, previousVersion, scoreRelease } from './release.js';
import { attestations, fakeFetch, json, packument } from './registry.fixture.js';
import { provenanceRepo, repoSlug } from './registry.js';

const signed = { dist: { attestations: { url: 'https://registry.npmjs.org/-/npm/v1/attestations/p@1' } } };

describe('scoreRelease: the 2026 incidents', () => {
  it('flags axios 1.14.1: the signed build record is dropped and a dependency is added in a patch release', () => {
    const p = packument('axios', {
      '1.14.0': { at: '2026-03-01T00:00:00Z', ...signed, dependencies: { 'follow-redirects': '^1', 'form-data': '^4' } },
      '1.14.1': { at: '2026-03-30T00:21:00Z', dependencies: { 'follow-redirects': '^1', 'form-data': '^4', 'plain-crypto-js': '^4' } },
    });
    const a = scoreRelease(p, '1.14.1');
    expect(a.signals).toEqual(['provenance_dropped', 'dependency_added']);
    expect(a.score).toBe(3);
    expect(a.previous).toBe('1.14.0');
  });

  it('flags node-ipc 12.0.1: a publisher who never released it before, and a release three times the size', () => {
    const p = packument('node-ipc', {
      '12.0.0': { at: '2025-12-01T00:00:00Z', _npmUser: { name: 'riaevangelist' }, dist: { unpackedSize: 37_000 } },
      '12.0.1': { at: '2026-02-01T00:00:00Z', _npmUser: { name: 'someone-new' }, dist: { unpackedSize: 117_000 } },
    });
    const a = scoreRelease(p, '12.0.1');
    expect(a.signals).toEqual(['new_publisher', 'size_jump']);
    expect(a.score).toBe(3);
  });

  it('flags a release built from a different repository than the one before it', () => {
    const p = packument('lib', {
      '1.0.0': { at: '2026-01-01T00:00:00Z', ...signed },
      '1.0.1': { at: '2026-02-01T00:00:00Z', ...signed },
    }, 'git+https://github.com/owner/lib.git');
    const a = scoreRelease(p, '1.0.1', { previous: 'https://github.com/owner/lib', current: 'https://github.com/attacker/lib' });
    expect(a.signals).toEqual(['provenance_repo_changed', 'repo_mismatch_declared']);
    expect(a.score).toBe(5);
  });

  it('flags a release that starts running code at install time, together with a new publisher', () => {
    const p = packument('lib', {
      '1.0.0': { at: '2026-01-01T00:00:00Z', _npmUser: { name: 'a' }, scripts: { test: 'x' } },
      '1.0.1': { at: '2026-02-01T00:00:00Z', _npmUser: { name: 'b' }, scripts: { postinstall: 'node x.js' } },
    });
    expect(scoreRelease(p, '1.0.1').signals).toEqual(['install_hook_added', 'new_publisher']);
  });
});

describe('scoreRelease: ordinary releases stay quiet', () => {
  it('does not flag a patch that only adds one dependency', () => {
    const p = packument('lib', {
      '1.0.0': { at: '2026-01-01T00:00:00Z', ...signed, dependencies: { a: '1' } },
      '1.0.1': { at: '2026-02-01T00:00:00Z', ...signed, dependencies: { a: '1', b: '1' } },
    });
    const a = scoreRelease(p, '1.0.1', { previous: 'https://github.com/o/lib', current: 'https://github.com/o/lib' });
    expect(a.signals).toEqual(['dependency_added']);
    expect(a.score).toBe(1);
  });

  it('compares a backport with its own line, not with the newest release', () => {
    const p = packument('mongoose', {
      '6.13.11': { at: '2025-01-01T00:00:00Z', _npmUser: { name: 'vkarpov15' }, dist: { unpackedSize: 900_000 } },
      '7.8.0': { at: '2025-06-01T00:00:00Z', _npmUser: { name: 'vkarpov15' }, dist: { unpackedSize: 2_000_000 } },
      '6.13.12': { at: '2025-09-01T00:00:00Z', _npmUser: { name: 'vkarpov15' }, dist: { unpackedSize: 905_000 } },
    });
    expect(previousVersion(p, '6.13.12')).toBe('6.13.11');
    expect(scoreRelease(p, '6.13.12')).toMatchObject({ score: 0, signals: [] });
  });

  it('compares a pre-release only with pre-releases', () => {
    const p = packument('lib', {
      '1.0.0': { at: '2026-01-01T00:00:00Z' },
      '1.1.0-beta.1': { at: '2026-01-10T00:00:00Z' },
      '1.1.0-beta.2': { at: '2026-01-20T00:00:00Z' },
      '1.1.0': { at: '2026-02-01T00:00:00Z' },
    });
    expect(previousVersion(p, '1.1.0-beta.2')).toBe('1.1.0-beta.1');
    expect(previousVersion(p, '1.1.0')).toBe('1.0.0');
    expect(previousVersion(p, '1.1.0-beta.1')).toBeNull();
  });

  it('scores a first release, and a release with no recorded time, as nothing to compare', () => {
    const p = packument('lib', { '1.0.0': { at: '2026-01-01T00:00:00Z', _npmUser: { name: 'a' } } });
    expect(scoreRelease(p, '1.0.0')).toMatchObject({ score: 0, previous: null });
    expect(scoreRelease(p, '9.9.9')).toMatchObject({ score: 0, publishedAt: null });
    p.versions['1.0.1'] = {};
    expect(scoreRelease(p, '1.0.1')).toMatchObject({ score: 0, publishedAt: null });
  });

  it('does not treat an unknown publisher or unknown size as a change', () => {
    const p = packument('lib', {
      '1.0.0': { at: '2026-01-01T00:00:00Z', _npmUser: { name: 'a' } },
      '1.0.1': { at: '2026-02-01T00:00:00Z' },
    });
    expect(scoreRelease(p, '1.0.1').signals).toEqual([]);
  });

  it('does not call the same publisher new, whichever line they published on before', () => {
    const p = packument('lib', {
      '1.0.0': { at: '2025-01-01T00:00:00Z', _npmUser: { name: 'a' } },
      '2.0.0': { at: '2025-06-01T00:00:00Z', _npmUser: { name: 'b' } },
      '2.0.1': { at: '2025-07-01T00:00:00Z', _npmUser: { name: 'a' } },
    });
    expect(scoreRelease(p, '2.0.1').signals).not.toContain('new_publisher');
  });
});

describe('scoreRelease: the thresholds', () => {
  it('needs the size to at least double and grow by 20 KB', () => {
    const grow = (was: number, now: number) => scoreRelease(packument('lib', {
      '1.0.0': { at: '2026-01-01T00:00:00Z', dist: { unpackedSize: was } },
      '1.0.1': { at: '2026-02-01T00:00:00Z', dist: { unpackedSize: now } },
    }), '1.0.1').signals.includes('size_jump');
    expect(grow(10_000, 25_000)).toBe(false); // 2.5x but only 15 KB
    expect(grow(100_000, 150_000)).toBe(false); // 50 KB but only 1.5x
    expect(grow(10_000, 30_000)).toBe(true);
    expect(grow(0, 500_000)).toBe(false); // no earlier size to compare with
  });

  it('calls a release dormant only after more than a year', () => {
    const gap = (to: string) => scoreRelease(packument('lib', {
      '1.0.0': { at: '2025-01-01T00:00:00Z' },
      '1.0.1': { at: to },
    }), '1.0.1').signals.includes('dormant_release');
    expect(gap('2025-12-31T00:00:00Z')).toBe(false);
    expect(gap('2026-01-02T00:00:00Z')).toBe(true);
  });
});

describe('assessRelease', () => {
  it('reads the build record of the release and the one before it, and sees a repository change', async () => {
    const p = packument('lib', {
      '1.0.0': { at: '2026-01-01T00:00:00Z', dist: { attestations: { url: 'https://reg.example/att/old' } } },
      '1.0.1': { at: '2026-02-01T00:00:00Z', dist: { attestations: { url: 'https://reg.example/att/new' } } },
    });
    const fetcher = fakeFetch({
      'https://reg.example/att/old': () => json(attestations('https://github.com/owner/lib')),
      'https://reg.example/att/new': () => json(attestations('https://github.com/attacker/lib')),
    });
    expect((await assessRelease(p, '1.0.1', fetcher)).signals).toContain('provenance_repo_changed');
  });

  it('treats a build record that cannot be read as unknown, never as a change', async () => {
    const p = packument('lib', {
      '1.0.0': { at: '2026-01-01T00:00:00Z', dist: { attestations: { url: 'https://reg.example/att/old' } } },
      '1.0.1': { at: '2026-02-01T00:00:00Z', dist: { attestations: { url: 'https://reg.example/att/new' } } },
    });
    const fetcher = fakeFetch({
      'https://reg.example/att/old': () => json({}, 500),
      'https://reg.example/att/new': () => json(attestations('https://github.com/attacker/lib')),
    });
    expect((await assessRelease(p, '1.0.1', fetcher)).signals).not.toContain('provenance_repo_changed');
  });
});

describe('repository helpers', () => {
  it.each([
    ['git+https://github.com/Owner/Repo.git', 'owner/repo'],
    ['https://github.com/o/r/tree/main/packages/x', 'o/r'],
    ['git@github.com:o/r.git', 'o/r'],
    ['git://github.com/o/r.git#v1', 'o/r'],
    ['https://gitlab.com/g/p', 'g/p'],
    ['https://example.com/o/r', ''],
    ['', ''],
  ])('repoSlug(%s)', (url, slug) => {
    expect(repoSlug(url)).toBe(slug);
  });

  it('reads the repository from a signed build record, and ignores a record it cannot read', () => {
    expect(provenanceRepo(attestations('https://github.com/o/r'))).toBe('https://github.com/o/r');
    expect(provenanceRepo({ attestations: [{ predicateType: 'https://slsa.dev/provenance/v1', bundle: { dsseEnvelope: { payload: '!!' } } }] })).toBeNull();
    expect(provenanceRepo(null)).toBeNull();
  });
});
