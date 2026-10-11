import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { config } from './vscode-stub';
import { extractPackageName } from '../src/decorator';
import { CrowsnestClient } from '../src/client';

// Stress and robustness tests that talk to real local HTTP servers (no mocks), because the failure modes that
// matter here are network behaviours: slow, huge, malformed, reset and concurrent responses.

type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => void;

let handler: Handler = (_req, res) => res.end('{}');
let server: http.Server;
let base = '';

beforeAll(async () => {
  server = http.createServer((req, res) => handler(req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  config.apiUrl = base;
});
afterAll(() => {
  server.closeAllConnections();
  server.close();
});

const json = (body: unknown, status = 200): Handler => (_req, res) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};

describe('extractPackageName on hostile input', () => {
  const limit = 500; // ms; a linear scan of 1 MB is a few ms, a backtracking blow-up takes seconds or never returns

  const timed = (line: string, lang: string) => {
    const t = performance.now();
    extractPackageName(line, lang);
    return performance.now() - t;
  };

  it.each([
    ['a 1 MB minified line', 'x'.repeat(1_000_000)],
    ['from + 100k spaces', 'from' + ' '.repeat(100_000)],
    ['100k "from " tokens', 'from '.repeat(100_000)],
    ['100k require( tokens', 'require('.repeat(100_000)],
    ['100k import( tokens', 'import ( '.repeat(100_000)],
    ['unterminated quote', "from '" + 'a'.repeat(1_000_000)],
    ['nested quotes', "from '" + "'\"".repeat(200_000)],
  ])('JS/TS: %s stays fast', (_name, line) => {
    expect(timed(line, 'typescript')).toBeLessThan(limit);
  });

  it.each([
    ['import + long name then bang', 'import ' + 'a'.repeat(200_000) + '!'],
    ['import a as b + 100k spaces + x', 'import a as b' + ' '.repeat(100_000) + 'x'],
    ['import a, many spaces', 'import a' + ' '.repeat(200_000) + 'as'],
    ['from + dotted name', 'from ' + 'a.'.repeat(100_000) + ' import'],
    ['100k leading spaces', ' '.repeat(100_000) + 'import x'],
    ['import with # comment 1 MB', 'import x # ' + 'c'.repeat(1_000_000)],
  ])('Python: %s stays fast', (_name, line) => {
    expect(timed(line, 'python')).toBeLessThan(limit);
  });

  it('never throws on odd characters', () => {
    for (const line of ['\u0000', '\uD800', "from '‮'", 'import \t\r\f x', "require('\n')", '@', "from '@/'"]) {
      expect(() => extractPackageName(line, 'javascript')).not.toThrow();
      expect(() => extractPackageName(line, 'python')).not.toThrow();
    }
  });
});

describe('CrowsnestClient against misbehaving servers', () => {
  it('returns null for a malformed body, an HTML error page and an empty body', async () => {
    const c = new CrowsnestClient();
    for (const body of ['{not json', '<html>502 Bad Gateway</html>', '']) {
      handler = json(body);
      expect(await c.vetoCheck('lodash')).toBeNull();
    }
  });

  it('treats an HTTP error status with a JSON error body as a failed lookup, not as a clean package', async () => {
    handler = json({ detail: 'boom' }, 500);
    const r = await new CrowsnestClient().vetoCheck('lodash');
    // A failed lookup must not be shown as a result (and so never as "clean").
    expect(r).toBeNull();
  });

  it('survives a connection that is reset mid-response', async () => {
    handler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': '1000' });
      res.write('{"blocked":');
      res.socket?.destroy();
    };
    expect(await new CrowsnestClient().vetoCheck('lodash')).toBeNull();
  });

  it('survives a refused connection', async () => {
    config.apiUrl = 'http://127.0.0.1:1';
    try {
      expect(await new CrowsnestClient().getStats()).toBeNull();
    } finally {
      config.apiUrl = base;
    }
  });

  it('survives an invalid API URL setting', async () => {
    config.apiUrl = 'not a url';
    try {
      expect(await new CrowsnestClient().vetoCheck('x')).toBeNull();
    } finally {
      config.apiUrl = base;
    }
  });

  it('coerces odd response shapes without throwing', async () => {
    const c = new CrowsnestClient();
    for (const body of [
      { blocked: 'yes', signals: 'not-an-array', probability: 'abc' },
      { blocked: null, signals: [null, 1, { a: 1 }], probability: null },
      { probability: Number.MAX_VALUE, signals: new Array(1000).fill('s') },
      [],
      'a string',
      42,
      null,
    ]) {
      handler = json(body);
      const r = await c.vetoCheck('x').catch((e) => `threw ${e}`);
      expect(typeof r === 'string' ? r : 'ok').toBe('ok');
    }
  });

  it('stats: tolerates incident counts as an object, a number or garbage', async () => {
    const c = new CrowsnestClient();
    for (const incidents of [{ CRITICAL: 1, HIGH: 2 }, 5, 'x', null, [1, 2], { A: 'z' }]) {
      handler = json({ active_incidents: incidents, total_packages: 3 });
      const s = await c.getStats();
      expect(s && Number.isFinite(s.activeIncidents)).toBe(true);
    }
  });

  it('gives up on a server that never answers', async () => {
    handler = () => {
      /* accept and say nothing */
    };
    const t = performance.now();
    expect(await new CrowsnestClient().vetoCheck('lodash')).toBeNull();
    expect(performance.now() - t).toBeLessThan(12_000);
  }, 20_000);

  it('gives up on a server that drips bytes forever (total time must be bounded)', async () => {
    let timer: NodeJS.Timeout | undefined;
    handler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.write('{"signals":[');
      timer = setInterval(() => res.write('"x",'), 1000);
      res.on('close', () => timer && clearInterval(timer));
    };
    const t = performance.now();
    const r = await Promise.race([
      new CrowsnestClient().vetoCheck('lodash').then(() => 'resolved'),
      new Promise((r) => setTimeout(() => r('still waiting'), 15_000)),
    ]);
    if (timer) clearInterval(timer);
    expect(r, `waited ${Math.round(performance.now() - t)} ms`).toBe('resolved');
  }, 25_000);

  it('does not buffer an unbounded response body', async () => {
    const chunk = Buffer.alloc(1024 * 1024, 0x61);
    let sent = 0;
    handler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      const pump = () => {
        while (sent < 300) {
          sent++;
          if (!res.write(chunk)) return void res.once('drain', pump);
        }
        res.end();
      };
      pump();
    };
    const before = process.memoryUsage().rss;
    await new CrowsnestClient().vetoCheck('lodash');
    const grew = (process.memoryUsage().rss - before) / 1048576;
    // 300 MB offered. A bounded reader aborts early; an unbounded one holds all of it.
    expect(sent, `server sent ${sent} MB, rss grew ${Math.round(grew)} MB`).toBeLessThan(50);
  }, 60_000);
});

describe('CrowsnestClient under load', () => {
  it('handles 100 concurrent lookups and returns every answer (the extension sends at most 5 at a time)', async () => {
    handler = json({ blocked: false, probability: 0.1, signals: [] });
    const c = new CrowsnestClient();
    const t = performance.now();
    const results = await Promise.all(Array.from({ length: 100 }, (_, i) => c.vetoCheck(`pkg-${i}`)));
    expect(results.every((r) => r && r.packageName.startsWith('pkg-'))).toBe(true);
    expect(performance.now() - t).toBeLessThan(15_000);
  }, 30_000);

  it('keeps answers matched to their requests when responses arrive out of order', async () => {
    handler = (req, res) => {
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', () => {
        const pkg = JSON.parse(body).package as string;
        const delay = pkg === 'slow' ? 300 : 10;
        setTimeout(() => json({ blocked: pkg === 'slow', probability: pkg === 'slow' ? 0.9 : 0.1, signals: [pkg] })(req, res), delay);
      });
    };
    const c = new CrowsnestClient();
    const [a, b, d] = await Promise.all([c.vetoCheck('slow'), c.vetoCheck('fast'), c.vetoCheck('quick')]);
    expect([a?.signals[0], b?.signals[0], d?.signals[0]]).toEqual(['slow', 'fast', 'quick']);
    expect([a?.vetoed, b?.vetoed, d?.vetoed]).toEqual([true, false, false]);
  });
});
