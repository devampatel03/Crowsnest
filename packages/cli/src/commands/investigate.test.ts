import { describe, expect, it } from 'vitest';
import { callFor, readAssessment } from './investigate.js';
import { parsePackageSpec } from './install.js';

const base = { blocked: false, probability: 0, signals: [], degraded: [] as string[] };

describe('callFor', () => {
  it('is Hold when the install check blocks the package', () => {
    expect(callFor({ ...base, blocked: true, probability: 1, signals: ['Matches known AI hallucination pattern'] })).toBe('Hold');
  });

  it('is Watch when anything was raised but nothing blocks', () => {
    expect(callFor({ ...base, probability: 0.3, signals: ['Only 17 weekly downloads'] })).toBe('Watch');
  });

  it('is Clear only when nothing was raised and nothing went unchecked', () => {
    expect(callFor(base)).toBe('Clear');
    expect(callFor({ ...base, degraded: ['malware list unreachable'] })).toBe('Not fully checked');
  });
});

describe('readAssessment', () => {
  it('reads the backend answer', () => {
    expect(readAssessment({ blocked: true, probability: 1, signals: ['a'], degraded: [], reason: 'x' })).toEqual({
      blocked: true, probability: 1, signals: ['a'], degraded: [], reason: 'x',
    });
  });

  it('returns null for an older backend that sends none', () => {
    expect(readAssessment(undefined)).toBeNull();
  });
});

describe('investigate package names', () => {
  it('keeps the scope of a scoped package', () => {
    expect(parsePackageSpec('@types/node')).toEqual(['@types/node', undefined]);
    expect(parsePackageSpec('@types/node@22.0.0')).toEqual(['@types/node', '22.0.0']);
    expect(parsePackageSpec('left-pad@1.3.0')).toEqual(['left-pad', '1.3.0']);
  });
});
