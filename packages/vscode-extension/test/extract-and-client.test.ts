import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

const httpMock = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('http', () => ({ ...httpMock, default: httpMock }));

import { extractPackageName } from '../src/decorator';
import { CrowsnestClient } from '../src/client';

describe('extractPackageName (JS/TS)', () => {
  const ts = (l: string) => extractPackageName(l, 'typescript');

  it.each([
    ["import x from 'lodash'", 'lodash'],
    ['import { a, b } from "react"', 'react'],
    ["import * as fs from 'fs'", 'fs'],
    ["import type { T } from 'zod'", 'zod'],
    ["const x = require('express')", 'express'],
    ["const m = await import('chalk')", 'chalk'],
    ["export { y } from 'rxjs'", 'rxjs'],
    ["import m from 'lodash/merge'", 'lodash'],
    ["import x from '@scope/pkg'", '@scope/pkg'],
    ["import x from '@scope/pkg/sub/deep'", '@scope/pkg'],
    ["import x from 'pkg.js'", 'pkg.js'],
  ])('%s -> %s', (line, expected) => {
    expect(ts(line)).toBe(expected);
  });

  it.each([
    "import x from './local'",
    "import x from '../up'",
    "import x from '/abs/path'",
    "import x from '@broken'",
    'const a = 1;',
    '',
    '   ',
    '// import x from "commented-but-matched?"',
  ])('returns null or handles: %j', (line) => {
    const r = ts(line);
    if (line.startsWith('//')) {
      // Documented limitation: comments are still matched.
      expect(['commented-but-matched?', null, 'commented-but-matched']).toContain(r);
    } else {
      expect(r).toBeNull();
    }
  });

  it('does not hang on pathological input (ReDoS guard)', () => {
    const evil = "from '" + 'a'.repeat(200_000);
    const t = Date.now();
    ts(evil);
    ts("require(" + ' '.repeat(100_000));
    expect(Date.now() - t).toBeLessThan(1000);
  });

  it('handles unicode package specifiers without throwing', () => {
    expect(() => ts("import x from '名前'")).not.toThrow();
  });
});

describe('extractPackageName (Python)', () => {
  const py = (l: string) => extractPackageName(l, 'python');
  it.each([
    ['import requests', 'requests'],
    ['import numpy as np', 'numpy'],
    ['from flask import Flask', 'flask'],
    ['  from yaml import safe_load', 'yaml'],
    ['import requests  # http', 'requests'],
  ])('%s -> %s', (line, expected) => expect(py(line)).toBe(expected));

  it.each([
    'import os.path',
    'from os.path import join',
    'from . import x',
    'from .sibling import y',
    'print("hello")',
    'import a, b',
  ])('skips %j', (line) => expect(py(line)).toBeNull());

  it('python language does not match JS require()', () => {
    expect(py("require('x')")).toBeNull();
  });
});

// ---- client with a stubbed http.request ----

function respondWith(body: string | null, opts: { error?: boolean; timeout?: boolean } = {}) {
  httpMock.request.mockImplementation((_options: unknown, cb: (res: EventEmitter) => void) => {
    const req = new EventEmitter() as EventEmitter & { write: () => void; end: () => void; destroy: () => void };
    req.write = () => {};
    req.destroy = () => {};
    req.end = () => {
      queueMicrotask(() => {
        if (opts.error) return req.emit('error', new Error('ECONNREFUSED'));
        if (opts.timeout) return req.emit('timeout');
        const res = new EventEmitter();
        cb(res);
        if (body !== null) res.emit('data', Buffer.from(body));
        res.emit('end');
      });
    };
    return req;
  });
}

describe('CrowsnestClient', () => {
  beforeEach(() => httpMock.request.mockReset());

  it('returns null (never throws) when the API is down', async () => {
    respondWith(null, { error: true });
    const c = new CrowsnestClient();
    expect(await c.vetoCheck('x')).toBeNull();
    expect(await c.investigatePackage('x')).toBeNull();
    expect(await c.getStats()).toBeNull();
  });

  it('returns null on timeout', async () => {
    respondWith(null, { timeout: true });
    expect(await new CrowsnestClient().getStats()).toBeNull();
  });

  it('returns null on a non-JSON body', async () => {
    respondWith('<html>502</html>');
    expect(await new CrowsnestClient().vetoCheck('x')).toBeNull();
  });

  it('normalises a veto response in the documented client shape', async () => {
    respondWith(JSON.stringify({ probability: '0.7', vetoed: 1, signals: ['a', 2] }));
    const r = await new CrowsnestClient().vetoCheck('pkg', '1.0.0');
    expect(r).toMatchObject({ packageName: 'pkg', version: '1.0.0', probability: 0.7, vetoed: true, signals: ['a', '2'] });
  });

  it('coerces garbage numbers to 0 and non-arrays to []', async () => {
    respondWith(JSON.stringify({ probability: 'abc', signals: 'nope' }));
    const r = await new CrowsnestClient().vetoCheck('pkg');
    expect(r).toMatchObject({ probability: 0, signals: [], vetoed: false });
  });

  it('maps socket alerts and npm metadata on investigate', async () => {
    respondWith(
      JSON.stringify({
        npm_metadata: { description: 'd', weekly_downloads: '5', maintainers: ['a'] },
        socket_alerts: [{ type: 'install-scripts', message: 'm', severity: 'high' }],
      })
    );
    const r = await new CrowsnestClient().investigatePackage('pkg');
    expect(r?.npmMetadata).toMatchObject({ description: 'd', weeklyDownloads: 5, maintainers: ['a'] });
    expect(r?.socketAlerts?.[0]).toEqual({ severity: 'high', category: 'install-scripts', description: 'm' });
  });

  // ---- Contract with the real backend (packages/core/api.py) ----

  it('sends the request field names the backend requires (QA-TE-09)', async () => {
    respondWith('{}');
    let sent = '';
    const orig = httpMock.request.getMockImplementation()!;
    httpMock.request.mockImplementation((o: unknown, cb: never) => {
      const req = orig(o, cb);
      req.write = (b: string) => {
        sent = b;
      };
      return req;
    });
    await new CrowsnestClient().vetoCheck('left-pad');
    // Backend VetoRequest is {package, version?, ecosystem}; a body with only package_name is a 422.
    expect(JSON.parse(sent)).toHaveProperty('package', 'left-pad');
  });

  it('treats the backend "blocked" flag as a veto (QA-TE-10)', async () => {
    respondWith(JSON.stringify({ blocked: true, probability: 1.0, signals: ['ACTIVE IOC'], package: 'x' }));
    const r = await new CrowsnestClient().vetoCheck('x');
    expect(r?.vetoed).toBe(true);
  });

  it('reads the backend stats shape (QA-TE-11)', async () => {
    respondWith(JSON.stringify({ active_incidents: { CRITICAL: 2, HIGH: 1, MEDIUM: 0, LOW: 0 }, total_packages: 9 }));
    const r = await new CrowsnestClient().getStats();
    expect(r?.activeIncidents).toBe(3);
  });
});
