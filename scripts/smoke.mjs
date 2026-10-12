#!/usr/bin/env node
// Crowsnest end-to-end smoke test (cross-platform, no dependencies beyond Node 20+).
//
//   node scripts/smoke.mjs                      # start backend on :8100 with a temp DuckDB, no API keys
//   SMOKE_API=http://localhost:8000 node scripts/smoke.mjs   # test an already-running backend (does not start/stop one)
//   SMOKE_DASH=http://localhost:3100 node scripts/smoke.mjs  # also check dashboard routes
//   SMOKE_PYTHON=.venv/bin/python node scripts/smoke.mjs     # python interpreter for the spawned backend
//
// Exits non-zero if any check fails. Always stops what it started.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = process.env.SMOKE_PORT || '8100';
let api = process.env.SMOKE_API;
const dash = process.env.SMOKE_DASH;
const startupTimeoutMs = Number(process.env.SMOKE_STARTUP_MS || 180000);

// Every request gets a hard timeout so a hung backend fails the check instead of hanging CI.
const realFetch = globalThis.fetch;
globalThis.fetch = (url, opts = {}) => realFetch(url, { signal: AbortSignal.timeout(20000), ...opts });

const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
}
async function check(name, fn) {
  try {
    const d = await fn();
    record(name, true, d || '');
  } catch (e) {
    record(name, false, String(e.message || e));
  }
}
function expect(cond, msg) { if (!cond) throw new Error(msg); }

function findPython() {
  if (process.env.SMOKE_PYTHON) return process.env.SMOKE_PYTHON;
  for (const p of ['.venv-claude/Scripts/python.exe', '.venv-claude/bin/python', '.venv/Scripts/python.exe', '.venv/bin/python']) {
    if (existsSync(join(root, p))) return join(root, p);
  }
  return process.platform === 'win32' ? 'python' : 'python3';
}

let child = null;
let tmp = null;
async function startBackend() {
  tmp = mkdtempSync(join(tmpdir(), 'crowsnest-smoke-'));
  api = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env,
    CROWSNEST_DB_PATH: join(tmp, 'smoke.duckdb'),
    CROWSNEST_SNAPSHOT_DIR: join(tmp, 'snap'),
    ANTHROPIC_API_KEY: '', GITHUB_TOKEN: '', SOCKET_API_KEY: '', NPM_TOKEN: '',
  };
  child = spawn(findPython(), ['-m', 'uvicorn', 'packages.core.api:app', '--host', '127.0.0.1', '--port', port],
    { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  const t0 = Date.now();
  while (Date.now() - t0 < startupTimeoutMs) {
    if (child.exitCode !== null) throw new Error(`backend exited early (${child.exitCode}):\n${log.slice(-800)}`);
    try { const r = await fetch(`${api}/health`); if (r.ok) return Date.now() - t0; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`backend not healthy after ${startupTimeoutMs} ms:\n${log.slice(-800)}`);
}
async function stopBackend() {
  if (child && child.exitCode === null) {
    if (process.platform === 'win32') {
      await new Promise((r) => spawn('taskkill', ['/PID', String(child.pid), '/T', '/F']).on('exit', r));
    } else {
      child.kill('SIGTERM');
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (tmp) { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* DB may still be locked */ } }
}

const post = (p, body) => fetch(`${api}${p}`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});

async function apiChecks() {
  await check('GET /health', async () => {
    const r = await fetch(`${api}/health`); const j = await r.json();
    expect(r.status === 200 && j.status === 'ok', `status ${r.status}`);
  });
  await check('GET /api/stats returns table_counts', async () => {
    const r = await fetch(`${api}/api/stats`); const j = await r.json();
    expect(r.status === 200 && j.table_counts, `status ${r.status}`);
  });
  await check('GET /api/incidents is a list', async () => {
    const r = await fetch(`${api}/api/incidents`); expect(r.status === 200 && Array.isArray(await r.json()), `status ${r.status}`);
  });
  await check('GET /api/incidents/<unknown> -> 404', async () => {
    const r = await fetch(`${api}/api/incidents/does-not-exist`); expect(r.status === 404, `status ${r.status}`);
  });
  await check('GET /api/scan/<unknown>/status -> 404', async () => {
    const r = await fetch(`${api}/api/scan/nope/status`); expect(r.status === 404, `status ${r.status}`);
  });
  await check('POST /api/veto validates body (422)', async () => {
    const r = await post('/api/veto', {}); expect(r.status === 422, `status ${r.status}`);
  });
  await check('POST /api/veto blocks seeded hallucinated package', async () => {
    const j = await (await post('/api/veto', { package: 'react-codeshift' })).json();
    expect(j.blocked === true, `blocked=${j.blocked}`);
  });
  await check('POST /api/veto allows unknown benign package', async () => {
    const j = await (await post('/api/veto', { package: 'react' })).json();
    expect(j.blocked === false, `blocked=${j.blocked}`);
  });
  await check('POST /api/query SELECT works', async () => {
    const j = await (await post('/api/query', { sql: 'SELECT 1 AS x' })).json(); expect(j[0]?.x === 1, JSON.stringify(j));
  });
  await check('POST /api/query rejects DROP (400)', async () => {
    const r = await post('/api/query', { sql: 'DROP TABLE gh_commits' }); expect(r.status === 400, `status ${r.status}`);
  });
  await check('POST /api/query rejects multi-statement (400)', async () => {
    const r = await post('/api/query', { sql: 'SELECT 1; SELECT 2' }); expect(r.status === 400, `status ${r.status}`);
  });
  await check('POST /api/query rejects filesystem table functions (read_csv/glob)', async () => {
    const r = await post('/api/query', { sql: "SELECT * FROM glob('*')" });
    expect(r.status === 400, `status ${r.status} (arbitrary local file read possible)`);
  });
  await check('SSE /api/events sends a connected event', async () => {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
    try {
      const r = await fetch(`${api}/api/events`, { signal: ctl.signal });
      expect(r.status === 200 && (r.headers.get('content-type') || '').includes('text/event-stream'), `status ${r.status}`);
      const { value } = await r.body.getReader().read();
      expect(new TextDecoder().decode(value).includes('"connected"'), 'no connected event');
    } finally { clearTimeout(t); ctl.abort(); }
  });
  await check('CORS does not reflect arbitrary origins with credentials', async () => {
    const r = await fetch(`${api}/api/stats`, { headers: { Origin: 'http://evil.example' } });
    const o = r.headers.get('access-control-allow-origin'); const c = r.headers.get('access-control-allow-credentials');
    expect(!(o && c === 'true'), `allow-origin=${o} allow-credentials=${c}`);
  });
  await check('POST /api/scan on a missing folder is rejected with a plain 400', async () => {
    const r = await post('/api/scan', { project_path: join(tmpdir(), 'crowsnest-no-such-dir') });
    expect(r.status === 400, `status ${r.status}`);
    expect(/does not exist/.test((await r.json()).detail || ''), 'no plain reason in the response');
  });
  await check('POST /api/scan on a folder without a lockfile is rejected', async () => {
    const r = await post('/api/scan', { project_path: tmpdir() });
    expect(r.status === 400, `status ${r.status}`);
  });
  await check('POST /api/scan on a folder with a lockfile ends in a clean status', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'crowsnest-smoke-'));
    writeFileSync(join(dir, 'package-lock.json'), JSON.stringify({ name: 'smoke', lockfileVersion: 3, packages: {} }));
    const { scan_id } = await (await post('/api/scan', { project_path: dir })).json();
    let s;
    for (let i = 0; i < 60; i++) {
      s = await (await fetch(`${api}/api/scan/${scan_id}/status`)).json();
      if (s.status !== 'pending' && s.status !== 'running') break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    expect(s.status === 'complete', `status=${s.status} error=${s.error || ''}`);
  });
}

async function dashChecks() {
  for (const [p, want] of [['/', 200], ['/docs', 200], ['/blog', 200], ['/glossary', 200], ['/about', 200], ['/privacy', 200],
    ['/horizon', 200], ['/lookout', 200], ['/hold', 200], ['/log', 200], ['/sitemap.xml', 200], ['/robots.txt', 200],
    ['/llms.txt', 200], ['/no-such-page', 404]]) {
    await check(`dashboard ${p} -> ${want}`, async () => {
      const r = await fetch(`${dash}${p}`); expect(r.status === want, `status ${r.status}`);
    });
  }
}

let exitCode = 0;
try {
  if (!api) {
    const ms = await startBackend();
    record('backend startup (temp DuckDB, no API keys)', true, `${ms} ms`);
  }
  await apiChecks();
  if (dash) await dashChecks();
} catch (e) {
  record('setup', false, String(e.message || e));
} finally {
  await stopBackend();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) exitCode = 1;
process.exit(exitCode);
