import { describe, expect, it } from 'vitest';
import { malwareFor } from './osv.js';
import { OSV, fakeFetch, json, osvAnswers } from './registry.fixture.js';

describe('malwareFor', () => {
  it('returns malware advisories for the exact version only, and ignores ordinary vulnerabilities', async () => {
    const fetcher = fakeFetch({ [OSV]: osvAnswers({ 'axios@1.14.1': ['MAL-2026-2307'] }) });
    const found = await malwareFor([
      { name: 'axios', version: '1.14.1' },
      { name: 'axios', version: '1.7.9' },
    ], fetcher);
    expect([...found]).toEqual([['axios@1.14.1', ['MAL-2026-2307']]]);
  });

  it('asks once about a version listed twice', async () => {
    let asked = 0;
    const fetcher = fakeFetch({
      [OSV]: async (_u, init) => {
        asked = (JSON.parse(String(init?.body)) as { queries: unknown[] }).queries.length;
        return json({ results: [{}] });
      },
    });
    await malwareFor([{ name: 'a', version: '1.0.0' }, { name: 'a', version: '1.0.0' }], fetcher);
    expect(asked).toBe(1);
  });

  it('follows result pages until they end', async () => {
    let calls = 0;
    const fetcher = fakeFetch({
      [OSV]: async (_u, init) => {
        calls++;
        const body = JSON.parse(String(init?.body)) as { queries: { page_token?: string }[] };
        return body.queries[0]?.page_token
          ? json({ results: [{ vulns: [{ id: 'MAL-2' }] }] })
          : json({ results: [{ vulns: [{ id: 'MAL-1' }], next_page_token: 'next' }] });
      },
    });
    const found = await malwareFor([{ name: 'a', version: '1.0.0' }], fetcher);
    expect(calls).toBe(2);
    expect(found.get('a@1.0.0')).toEqual(['MAL-1', 'MAL-2']);
  });

  it('splits a large list into batches of 500', async () => {
    const sizes: number[] = [];
    const fetcher = fakeFetch({
      [OSV]: async (_u, init) => {
        const { queries } = JSON.parse(String(init?.body)) as { queries: unknown[] };
        sizes.push(queries.length);
        return json({ results: queries.map(() => ({})) });
      },
    });
    await malwareFor(Array.from({ length: 1100 }, (_, i) => ({ name: `p${i}`, version: '1.0.0' })), fetcher);
    expect(sizes).toEqual([500, 500, 100]);
  });

  it('makes no request for an empty list', async () => {
    const fetcher = fakeFetch({});
    expect((await malwareFor([], fetcher)).size).toBe(0);
    expect(fetcher.calls).toEqual([]);
  });

  it('throws, never answers "clean", when the list cannot be read', async () => {
    await expect(malwareFor([{ name: 'a', version: '1.0.0' }], fakeFetch({ [OSV]: () => json({}, 503) }))).rejects.toThrow(/HTTP 503/);
    await expect(malwareFor([{ name: 'a', version: '1.0.0' }], fakeFetch({ [OSV]: () => json({ results: [] }) }))).rejects.toThrow(/different number/);
    const down = (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch;
    await expect(malwareFor([{ name: 'a', version: '1.0.0' }], down)).rejects.toThrow(/fetch failed/);
  });
});
