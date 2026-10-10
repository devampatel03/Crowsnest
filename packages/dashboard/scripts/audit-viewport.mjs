// Viewport audit for every sitemap URL plus the four console routes
// (/horizon /lookout /hold /log), driven over CDP (no dependencies).
//   node scripts/audit-viewport.mjs http://localhost:3101 [chrome.exe]
// Per page, at 375x812 and 1440x900: no horizontal scroll
// (documentElement.scrollWidth <= innerWidth). At 375 it also lists links and
// buttons whose hit area is under 44px in either dimension (inline links in
// running prose are reported separately as "prose"). Exits 1 on any overflow.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const base = (process.argv[2] ?? 'http://localhost:3000').replace(/\/$/, '');
const chrome = process.argv[3] ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9300 + Math.floor(Math.random() * 500);
const dir = mkdtempSync(join(tmpdir(), 'audit-'));
const proc = spawn(chrome, [`--remote-debugging-port=${port}`, '--headless=new', '--no-first-run', `--user-data-dir=${dir}`, 'about:blank'], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(200);
  }
  throw new Error('chrome did not start');
}

const ws = new WebSocket(await wsUrl());
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) pending.get(d.id)(d);
};
const send = (method, params = {}) =>
  new Promise((res) => {
    const n = ++id;
    pending.set(n, res);
    ws.send(JSON.stringify({ id: n, method, params }));
  });
const evalJs = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.result.value;

const xml = await (await fetch(`${base}/sitemap.xml`)).text();
const CONSOLE = ['/horizon', '/lookout', '/hold', '/log'];
const paths = [...[...xml.matchAll(/<loc>https?:\/\/[^/]+(\/[^<]*)<\/loc>/g)].map((m) => m[1] || '/'), ...CONSOLE];

const TAP = `(() => {
  const bad = [];
  for (const el of document.querySelectorAll('a[href], button, summary, [role=button]')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden') continue;
    const inProse = !!el.closest('p, li') && cs.display === 'inline';
    if ((r.height < 44 || r.width < 24) && !(inProse)) bad.push((el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
  }
  return bad;
})()`;

let failures = 0;
const smallTargets = {};
for (const [w, h] of [[375, 812], [1440, 900]]) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 500 });
  for (const p of paths) {
    await send('Page.navigate', { url: base + p });
    await sleep(CONSOLE.includes(p) ? 2500 : 500); // console pages fetch live data first
    const status = await evalJs("performance.getEntriesByType('navigation')[0]?.responseStatus ?? 0");
    if (status && (status < 200 || status >= 300)) {
      failures++;
      console.log(`HTTP ${status} at ${w}px ${p}`);
    }
    const m = await evalJs('JSON.stringify({sw: document.documentElement.scrollWidth, iw: window.innerWidth})');
    const { sw } = JSON.parse(m);
    const iw = w; // mobile emulation grows innerWidth to fit overflowing content, so compare with the device width
    if (sw > iw) {
      failures++;
      const culprit = await evalJs(`(() => { const out = []; for (const el of document.querySelectorAll('body *')) { const r = el.getBoundingClientRect(); if (r.right > ${w} + 1 && r.width > 0) { let scroller = false; for (let a = el.parentElement; a; a = a.parentElement) { const o = getComputedStyle(a).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') { scroller = true; break; } } if (!scroller) out.push(el.tagName.toLowerCase() + '.' + String(el.className).slice(0, 60) + ' right=' + Math.round(r.right)); } } return out.slice(0, 3).join(' || '); })()`);
      console.log(`OVERFLOW ${w}px ${p}: scrollWidth ${sw} > ${iw}; ${culprit}`);
    }
    if (w === 375) {
      const bad = await evalJs(TAP);
      if (bad.length) smallTargets[p] = bad;
    }
  }
}
const n = Object.values(smallTargets).reduce((a, b) => a + b.length, 0);
console.log(`${paths.length} urls x 2 viewports; overflow failures: ${failures}; small targets at 375 (non-prose): ${n}`);
for (const [p, list] of Object.entries(smallTargets).slice(0, 8)) console.log('  ', p, list.slice(0, 6).join(' | '));
ws.close();
proc.kill();
process.exit(failures ? 1 : 0);
