import { describe, expect, it } from 'vitest';
import {
  installTarget,
  isExactVersion,
  isSafePackageSpec,
  iconFor,
  parsePackageSpec,
  parseMinReleaseAge,
  pickVersion,
} from './install.js';
import { renderReport } from './check.js';
import type { ChangeReport, ChangeResult } from '../api.js';

describe('parsePackageSpec', () => {
  it.each([
    ['axios', ['axios', undefined]],
    ['axios@1.14.1', ['axios', '1.14.1']],
    ['axios@^1.14.0', ['axios', '^1.14.0']],
    ['@scope/pkg', ['@scope/pkg', undefined]],
    ['@scope/pkg@2.0.0', ['@scope/pkg', '2.0.0']],
  ])('%s', (spec, expected) => {
    expect(parsePackageSpec(spec)).toEqual(expected);
  });
});

describe('isSafePackageSpec', () => {
  it.each([
    ['left-pad', undefined],
    ['@scope/pkg', '1.2.3'],
    ['axios', '^1.14.0'],
    ['axios', '~1.14'],
    ['axios', 'latest'],
    ['axios', '1.x'],
    ['axios', '1.2.3-rc.1'],
  ])('accepts %s %s', (name, spec) => {
    expect(isSafePackageSpec(name, spec)).toBe(true);
  });

  it.each([
    ['axios; calc', undefined],
    ['axios && calc', undefined],
    ['axios', '1.0.0 && calc'],
    ['axios', '>=1 <2'],
    ['axios', '1|2'],
    ['axios', '$(calc)'],
    ['AXIOS', undefined],
    ['-g', undefined],
    ['', undefined],
    ['git+https://example.invalid/x.git', undefined],
  ])('refuses %s %s', (name, spec) => {
    expect(isSafePackageSpec(name, spec)).toBe(false);
  });
});

describe('isExactVersion', () => {
  it.each([
    ['1.2.3', true],
    ['v1.2.3', true],
    ['1.2.3-rc.1', true],
    ['^1.2.0', false],
    ['~1.2', false],
    ['latest', false],
    ['>=1 <2', false],
    ['', false],
    [undefined, false],
  ])('%s', (spec, expected) => {
    expect(isExactVersion(spec as string | undefined)).toBe(expected);
  });
});

describe('pickVersion', () => {
  it('reads a single version', () => {
    expect(pickVersion('"1.14.1"\n')).toBe('1.14.1');
  });

  it('takes the highest of the versions a range matches', () => {
    expect(pickVersion('["1.14.0","1.14.1","1.15.0"]')).toBe('1.15.0');
  });

  it('ignores output it cannot trust', () => {
    expect(pickVersion('')).toBeUndefined();
    expect(pickVersion('not json')).toBeUndefined();
    expect(pickVersion('{"error":{"code":"E404"}}')).toBeUndefined();
    expect(pickVersion('["latest"]')).toBeUndefined();
  });
});

describe('installTarget', () => {
  it('installs the version that was checked, never the range that was asked for', () => {
    expect(installTarget('axios', '^1.14.0', '1.14.1')).toBe('axios@1.14.1');
    expect(installTarget('axios', undefined, '1.14.1')).toBe('axios@1.14.1');
  });

  it('falls back to what was typed when no version could be checked', () => {
    expect(installTarget('axios', '^1.14.0', null)).toBe('axios@^1.14.0');
    expect(installTarget('axios', undefined, null)).toBe('axios');
  });
});

describe('parseMinReleaseAge', () => {
  it('accepts days, including zero', () => {
    expect(parseMinReleaseAge(undefined)).toBeUndefined();
    expect(parseMinReleaseAge('0')).toBe(0);
    expect(parseMinReleaseAge('2.5')).toBe(2.5);
  });

  it('rejects anything else', () => {
    for (const bad of ['-1', 'abc', '366', 'NaN']) {
      expect(() => parseMinReleaseAge(bad)).toThrow('--min-release-age');
    }
  });
});

describe('iconFor', () => {
  it('marks malware, hijack and age signals differently from a generic warning', () => {
    const generic = iconFor('something else');
    expect(iconFor('ACTIVE IOC: axios@1.14.1 is listed as malicious (MAL-1)')).not.toBe(generic);
    expect(iconFor('Release looks hijacked: provenance_dropped')).not.toBe(generic);
    expect(iconFor('Version 1.0.0 was published 3 hours ago; policy is to wait 2 days')).not.toBe(generic);
  });
});

describe('renderReport', () => {
  const result = (over: Partial<ChangeResult>): ChangeResult => ({
    blocked: false,
    package: 'axios',
    version: '1.14.1',
    probability: 0,
    signals: [],
    reason: '',
    override_flag: null,
    degraded: [],
    release_age_hours: 100,
    change: 'updated',
    previous_versions: ['1.14.0'],
    ...over,
  });

  it('says what was blocked and why', () => {
    const bad = result({ blocked: true, signals: ['ACTIVE IOC: axios@1.14.1 is listed as malicious (MAL-2026-2307)'] });
    const report: ChangeReport = {
      base_ref: 'origin/main',
      project_path: '.',
      checked: 2,
      unchanged: 10,
      blocked: [bad],
      degraded: ['malware feed unreachable'],
      results: [bad, result({ package: 'left-pad', version: '1.3.0', change: 'added', previous_versions: [] })],
    };
    const text = renderReport(report);
    expect(text).toContain('Checked 2 package version(s) changed since origin/main.');
    expect(text).toContain('axios@1.14.1 (was 1.14.0)');
    expect(text).toContain('listed as malicious (MAL-2026-2307)');
    expect(text).toContain('left-pad@1.3.0');
    expect(text).toContain('Not checked: malware feed unreachable');
    expect(text).toContain('1 version(s) should not be merged.');
  });

  it('says so when there is nothing to block', () => {
    const report: ChangeReport = {
      base_ref: null,
      project_path: '.',
      checked: 0,
      unchanged: 0,
      blocked: [],
      degraded: [],
      results: [],
    };
    const text = renderReport(report);
    expect(text).toContain('Checked 0 package version(s) in the lockfiles.');
    expect(text).toContain('Nothing to block.');
  });
});
