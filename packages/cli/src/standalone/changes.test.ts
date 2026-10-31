import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parsePackageLock, quickChanges, readBaseLockfile } from './changes.js';
import { OSV, fakeFetch, json, osvAnswers, packument, registryBody } from './registry.fixture.js';

const NOW = () => new Date('2026-04-10T12:00:00Z');

const lockV3 = (packages: Record<string, unknown>): string =>
  JSON.stringify({ name: 'app', lockfileVersion: 3, packages: { '': { name: 'app', version: '1.0.0' }, ...packages } });

describe('parsePackageLock', () => {
  it('reads lockfile version 3: nested and scoped packages, skipping the root, links and workspaces', () => {
    const text = lockV3({
      'node_modules/axios': { version: '1.14.1' },
      'node_modules/axios/node_modules/form-data': { version: '4.0.0' },
      'node_modules/@scope/pkg': { version: '2.0.0' },
      'node_modules/alias': { name: 'real-name', version: '3.0.0' },
      'node_modules/mine': { resolved: 'packages/mine', link: true },
      'packages/mine': { version: '0.0.1' },
      'node_modules/from-git': { version: 'git+https://example.invalid/x.git#abc' },
    });
    expect(parsePackageLock(text).map((p) => `${p.name}@${p.version}`).sort()).toEqual([
      '@scope/pkg@2.0.0', 'axios@1.14.1', 'form-data@4.0.0', 'real-name@3.0.0',
    ]);
  });

  it('reads lockfile version 1: nested dependencies', () => {
    const text = JSON.stringify({
      lockfileVersion: 1,
      dependencies: { a: { version: '1.0.0', dependencies: { b: { version: '2.0.0' } } }, c: { version: '3.0.0' } },
    });
    expect(parsePackageLock(text).map((p) => `${p.name}@${p.version}`)).toEqual(['a@1.0.0', 'b@2.0.0', 'c@3.0.0']);
  });

  it('keeps two versions of one package', () => {
    const text = lockV3({ 'node_modules/x': { version: '1.0.0' }, 'node_modules/y/node_modules/x': { version: '2.0.0' } });
    expect(parsePackageLock(text).map((p) => p.version).sort()).toEqual(['1.0.0', '2.0.0']);
  });
});

describe('quickChanges', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crowsnest-changes-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const write = (name: string, text: string): void => fs.writeFileSync(path.join(dir, name), text);

  const axios = packument('axios', {
    '1.14.0': { at: '2026-03-01T00:00:00Z', dist: { attestations: { url: 'https://reg.example/a' } }, dependencies: { a: '1' } },
    '1.14.1': { at: '2026-03-30T00:00:00Z', dependencies: { a: '1', 'plain-crypto-js': '^4' } },
  });
  const left = packument('left-pad', { '1.3.0': { at: '2020-01-01T00:00:00Z' } });
  const registry = {
    'https://registry.npmjs.org/axios': () => json(registryBody(axios)),
    'https://registry.npmjs.org/left-pad': () => json(registryBody(left)),
    'https://reg.example/': () => json({ attestations: [] }),
  };

  it('vets only what the change adds, and blocks a hijacked release', async () => {
    write('package-lock.json', lockV3({ 'node_modules/axios': { version: '1.14.1' }, 'node_modules/left-pad': { version: '1.3.0' } }));
    const base = lockV3({ 'node_modules/axios': { version: '1.14.0' }, 'node_modules/left-pad': { version: '1.3.0' } });
    const report = await quickChanges(dir, { base: 'origin/main', fetcher: fakeFetch({ [OSV]: osvAnswers({}), ...registry }), readBase: async () => base, now: NOW });

    expect(report).toMatchObject({ base_ref: 'origin/main', checked: 1, unchanged: 1 });
    expect(report.results[0]).toMatchObject({ package: 'axios', version: '1.14.1', change: 'updated', previous_versions: ['1.14.0'], blocked: true });
    expect(report.blocked).toHaveLength(1);
    expect(report.degraded).toEqual([]);
  });

  it('blocks a version the malware list names with one question for the whole change', async () => {
    write('package-lock.json', lockV3({ 'node_modules/axios': { version: '1.14.1' }, 'node_modules/left-pad': { version: '1.3.0' } }));
    const fetcher = fakeFetch({ [OSV]: osvAnswers({ 'axios@1.14.1': ['MAL-2026-2307'] }), ...registry });
    const report = await quickChanges(dir, { base: 'main', fetcher, readBase: async () => null, now: NOW });
    expect(report.results.map((r) => [r.package, r.change, r.blocked])).toEqual([['axios', 'added', true], ['left-pad', 'added', false]]);
    expect(fetcher.calls.filter((u) => u === OSV)).toHaveLength(1);
  });

  it('reads an unchanged lockfile as nothing to check', async () => {
    const text = lockV3({ 'node_modules/left-pad': { version: '1.3.0' } });
    write('package-lock.json', text);
    const fetcher = fakeFetch({});
    const report = await quickChanges(dir, { base: 'main', fetcher, readBase: async () => text, now: NOW });
    expect(report).toMatchObject({ checked: 0, unchanged: 1, blocked: [], degraded: [] });
    expect(fetcher.calls).toEqual([]);
  });

  it('with no base, checks the malware list only and says so', async () => {
    write('package-lock.json', lockV3({ 'node_modules/axios': { version: '1.14.1' } }));
    const fetcher = fakeFetch({ [OSV]: osvAnswers({ 'axios@1.14.1': ['MAL-1'] }), ...registry });
    const report = await quickChanges(dir, { fetcher, now: NOW });
    expect(report.blocked).toHaveLength(1);
    expect(report.degraded.join('\n')).toContain('only the malware list was checked');
    expect(fetcher.calls.some((u) => u.includes('registry.npmjs.org'))).toBe(false);
  });

  it('says which lockfiles it did not read instead of reading as clean', async () => {
    write('package-lock.json', lockV3({}));
    write('yarn.lock', '');
    write('poetry.lock', '');
    const report = await quickChanges(dir, { base: 'main', fetcher: fakeFetch({}), readBase: async () => null, now: NOW });
    expect(report.degraded.join('\n')).toMatch(/yarn\.lock was not read/);
    expect(report.degraded.join('\n')).toMatch(/poetry\.lock was not read/);
  });

  it('says so when there is no package-lock.json at all', async () => {
    write('pnpm-lock.yaml', '');
    const report = await quickChanges(dir, { base: 'main', fetcher: fakeFetch({}), now: NOW });
    expect(report.checked).toBe(0);
    expect(report.degraded.join('\n')).toMatch(/no package-lock\.json/);
    expect(report.degraded.join('\n')).toMatch(/pnpm-lock\.yaml was not read/);
  });

  it('reports a malware list that cannot be read, and still checks release changes', async () => {
    write('package-lock.json', lockV3({ 'node_modules/axios': { version: '1.14.1' } }));
    const fetcher = fakeFetch({ [OSV]: () => json({}, 503), ...registry });
    const report = await quickChanges(dir, { base: 'main', fetcher, readBase: async () => null, now: NOW });
    expect(report.degraded.join('\n')).toMatch(/malware list could not be read/);
    expect(report.results[0]?.blocked).toBe(true);
  });

  it('fetches each package from the registry once, however many versions of it are added', async () => {
    write('package-lock.json', lockV3({ 'node_modules/axios': { version: '1.14.0' }, 'node_modules/x/node_modules/axios': { version: '1.14.1' } }));
    const fetcher = fakeFetch({ [OSV]: osvAnswers({}), ...registry });
    await quickChanges(dir, { base: 'main', fetcher, readBase: async () => null, now: NOW });
    expect(fetcher.calls.filter((u) => u === 'https://registry.npmjs.org/axios')).toHaveLength(1);
  });

  it('keeps a registry failure for one package from stopping the rest', async () => {
    write('package-lock.json', lockV3({ 'node_modules/axios': { version: '1.14.1' }, 'node_modules/left-pad': { version: '1.3.0' } }));
    const fetcher = fakeFetch({ [OSV]: osvAnswers({}), ...registry, 'https://registry.npmjs.org/axios': () => json({}, 500) });
    const report = await quickChanges(dir, { base: 'main', fetcher, readBase: async () => null, now: NOW, minReleaseAgeDays: 0 });
    expect(report.results).toHaveLength(2);
    expect(report.degraded.join('\n')).toMatch(/axios@1\.14\.1: .*could not be read/);
    expect(report.results[1]).toMatchObject({ package: 'left-pad', blocked: false });
  });
});

describe('readBaseLockfile', () => {
  it.each(['--output=x', '-x', 'a b', 'main;calc', '$(calc)', ''])('refuses the ref %j before running git', async (ref) => {
    await expect(readBaseLockfile('.', ref)).rejects.toThrow(/not a usable git ref/);
  });

  it('refuses a folder that is not a git repository, with git\'s own reason', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crowsnest-nogit-'));
    try {
      await expect(readBaseLockfile(dir, 'HEAD')).rejects.toThrow(/git could not read package-lock\.json|git is not installed/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
