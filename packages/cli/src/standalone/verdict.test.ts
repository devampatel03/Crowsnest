import { describe, expect, it } from 'vitest';
import { describeAge, quickVeto } from './verdict.js';
import { OSV, fakeFetch, json, osvAnswers, packument, registryBody } from './registry.fixture.js';

const NOW = new Date('2026-04-10T12:00:00Z');
const now = () => NOW;

const axios = packument('axios', {
  '1.7.9': { at: '2026-01-01T00:00:00Z', dist: { attestations: { url: 'https://reg.example/a' } } },
  '1.14.0': { at: '2026-03-01T00:00:00Z', dist: { attestations: { url: 'https://reg.example/b' } }, dependencies: { a: '1' } },
  '1.14.1': { at: '2026-03-30T00:21:00Z', dependencies: { a: '1', 'plain-crypto-js': '^4' } },
  '1.15.0': { at: '2026-04-10T10:00:00Z', dist: { attestations: { url: 'https://reg.example/c' } }, dependencies: { a: '1' } },
});

const world = (malware: Record<string, string[]> = {}) =>
  fakeFetch({
    [OSV]: osvAnswers(malware),
    'https://registry.npmjs.org/axios': () => json(registryBody(axios)),
    'https://reg.example/': () => json({ attestations: [] }),
  });

describe('quickVeto', () => {
  it('blocks a version the malware list names, worded like the full check', async () => {
    const v = await quickVeto('axios', '1.14.1', { fetcher: world({ 'axios@1.14.1': ['MAL-2026-2307'] }), now });
    expect(v).toMatchObject({ blocked: true, probability: 1, ecosystem: 'npm', override_flag: '--crowsnest-acknowledge-risk' });
    expect(v.signals[0]).toBe('ACTIVE IOC: axios@1.14.1 is listed as malicious (MAL-2026-2307)');
    expect(v.reason).toBe(v.signals[0]);
  });

  it('blocks a hijacked-looking release before any list names it', async () => {
    const v = await quickVeto('axios', '1.14.1', { fetcher: world(), now });
    expect(v.blocked).toBe(true);
    expect(v.probability).toBe(0.6);
    expect(v.signals).toEqual(['Release looks hijacked: provenance_dropped, dependency_added compared with the previous version']);
  });

  it('lets an ordinary old release through with no signals', async () => {
    const v = await quickVeto('axios', '1.14.0', { fetcher: world(), now });
    expect(v).toMatchObject({ blocked: false, probability: 0, signals: [], degraded: [], override_flag: null });
    expect(v.reason).toBe('No specific signals detected');
    expect(v.release_age_hours).toBeGreaterThan(24 * 40);
  });

  it('holds back a version younger than the minimum age, and lets it through when the rule is off', async () => {
    const held = await quickVeto('axios', '1.15.0', { fetcher: world(), now });
    expect(held.blocked).toBe(true);
    expect(held.signals).toEqual(['Version 1.15.0 was published 2 hours ago; policy is to wait 2 days']);
    expect(held.release_age_hours).toBe(2);
    const off = await quickVeto('axios', '1.15.0', { fetcher: world(), now, minReleaseAgeDays: 0 });
    expect(off.blocked).toBe(false);
  });

  it('says what it could not check when the malware list is down, and still applies the other checks', async () => {
    const fetcher = fakeFetch({
      [OSV]: () => json({}, 503),
      'https://registry.npmjs.org/axios': () => json(registryBody(axios)),
      'https://reg.example/': () => json({ attestations: [] }),
    });
    const v = await quickVeto('axios', '1.14.1', { fetcher, now });
    expect(v.degraded[0]).toMatch(/malware list could not be read.*503/);
    expect(v.blocked).toBe(true); // the hijack pattern still blocks it
    const clean = await quickVeto('axios', '1.14.0', { fetcher, now });
    expect(clean.blocked).toBe(false);
    expect(clean.degraded).toHaveLength(1);
  });

  it('says what it could not check when the registry is down', async () => {
    const fetcher = fakeFetch({ [OSV]: osvAnswers({}), 'https://registry.npmjs.org/': () => json({}, 500) });
    const v = await quickVeto('axios', '1.14.0', { fetcher, now });
    expect(v.blocked).toBe(false);
    expect(v.degraded).toEqual([expect.stringMatching(/npm registry could not be read.*500/)]);
  });

  it('does not read an unknown package or version as clean', async () => {
    const fetcher = fakeFetch({ [OSV]: osvAnswers({}), 'https://registry.npmjs.org/axios': () => json(registryBody(axios)) });
    expect((await quickVeto('axios', '9.9.9', { fetcher, now })).degraded).toEqual([expect.stringContaining('no version 9.9.9')]);
    expect((await quickVeto('nope', '1.0.0', { fetcher, now })).degraded).toEqual([expect.stringContaining('no package with this name')]);
  });

  it('reports a missing version as not checked, without asking anything', async () => {
    const fetcher = fakeFetch({});
    const v = await quickVeto('axios', undefined, { fetcher, now });
    expect(v).toMatchObject({ blocked: false, version: null });
    expect(v.degraded).toHaveLength(1);
    expect(fetcher.calls).toEqual([]);
  });

  it('can check the malware list alone', async () => {
    const fetcher = fakeFetch({ [OSV]: osvAnswers({ 'axios@1.14.1': ['MAL-1'] }) });
    const v = await quickVeto('axios', '1.14.1', { fetcher, now, skipRegistry: true });
    expect(v.blocked).toBe(true);
    expect(fetcher.calls.every((u) => u.startsWith('https://api.osv.dev'))).toBe(true);
    const clean = await quickVeto('axios', '1.7.9', { fetcher, now, skipRegistry: true });
    expect(clean).toMatchObject({ blocked: false, degraded: [] });
  });
});

describe('describeAge', () => {
  it('uses hours under two days and days after', () => {
    expect(describeAge(5)).toBe('5 hours');
    expect(describeAge(47.6)).toBe('48 hours');
    expect(describeAge(48)).toBe('2 days');
    expect(describeAge(72)).toBe('3 days');
  });
});
