#!/usr/bin/env node
// Fails (exit 1) on any production pnpm advisory except the explicit exceptions below.
//   node scripts/audit-js.mjs        (run `pnpm install --frozen-lockfile` first)
//
// An exception is only valid while NO patched version exists. When the advisory gains a fix,
// remove it from ALLOWED so the audit starts failing and forces the upgrade.
import { spawnSync } from 'node:child_process';

const ALLOWED = {
  'GHSA-vfj7-8cjw-p6xm': 'braces: no patched version; build-time only (tailwindcss/chokidar), not shipped',
  'GHSA-hp3w-g68c-fv3c': 'sprintf-js: no patched version; build-time only (gray-matter/js-yaml), not shipped',
};

const r = spawnSync('pnpm', ['audit', '--prod', '--json'], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
  maxBuffer: 64 * 1024 * 1024,
});
let report;
try {
  report = JSON.parse(r.stdout);
} catch {
  console.error('FAIL: could not parse `pnpm audit --json` output (registry unreachable?)');
  console.error(r.stdout, r.stderr);
  process.exit(1);
}
if (report.error) {
  console.error('FAIL: pnpm audit error:', JSON.stringify(report.error));
  process.exit(1);
}

const advisories = Object.values(report.advisories || {});
const blocking = [];
for (const a of advisories) {
  const ghsa = a.github_advisory_id || (a.url || '').split('/').pop();
  if (ALLOWED[ghsa]) {
    console.log(`allowed  ${ghsa}  ${a.severity}  ${a.module_name}  (${ALLOWED[ghsa]})`);
  } else {
    blocking.push(a);
    console.log(`BLOCKING ${ghsa}  ${a.severity}  ${a.module_name}  ${a.title}`);
  }
}
if (blocking.length) {
  console.error(`FAIL: ${blocking.length} advisory/advisories not on the exception list`);
  process.exit(1);
}
console.log(`OK: ${advisories.length} advisory/advisories, all on the documented exception list`);
