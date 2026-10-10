#!/usr/bin/env node
// Release gate. Usage:
//   node scripts/release-check.mjs v0.1.0           verify tag == all manifest versions and CHANGELOG has the section
//   node scripts/release-check.mjs v0.1.0 --notes   print that CHANGELOG section (release notes)
// Exits 1 on any mismatch.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tag = process.argv[2];
const wantNotes = process.argv.includes('--notes');
if (!tag || !/^v\d+\.\d+\.\d+/.test(tag)) {
  console.error('usage: release-check.mjs vX.Y.Z [--notes]');
  process.exit(1);
}
const version = tag.slice(1);

const versions = {};
for (const p of ['package.json', 'packages/cli/package.json', 'packages/dashboard/package.json',
  'packages/slack-bot/package.json', 'packages/vscode-extension/package.json']) {
  versions[p] = JSON.parse(readFileSync(resolve(root, p), 'utf8')).version;
}
const py = readFileSync(resolve(root, 'pyproject.toml'), 'utf8').match(/^version\s*=\s*"([^"]+)"/m);
versions['pyproject.toml'] = py && py[1];

const bad = Object.entries(versions).filter(([, v]) => v !== version);
if (bad.length) {
  for (const [f, v] of bad) console.error(`FAIL ${f} is ${v}, tag is ${version}`);
  process.exit(1);
}

const log = readFileSync(resolve(root, 'CHANGELOG.md'), 'utf8').split('\r\n').join('\n');
// Find the "## [x.y.z]" section by scanning lines, so the tag is never interpreted as a pattern.
const lines = log.split('\n');
const isHeading = (l) => l.startsWith('## ');
// "## [0.1.0] - date" or "## 0.1.0": strip the optional bracket, then require the version to end there.
const headingVersion = (l) => l.slice(3).replace('[', '');
const start = lines.findIndex((l) => {
  if (!isHeading(l)) return false;
  const h = headingVersion(l);
  return h.startsWith(version) && ['', ']', ' '].includes(h.charAt(version.length));
});
if (start === -1) {
  console.error(`FAIL CHANGELOG.md has no "## [${version}]" section`);
  process.exit(1);
}
let end = lines.findIndex((l, n) => n > start && isHeading(l));
if (end === -1) end = lines.length;
const notes = lines.slice(start + 1, end).join('\n');
if (wantNotes) process.stdout.write(notes.trim() + '\n');
else console.log(`OK tag ${tag} matches ${Object.keys(versions).length} manifests and CHANGELOG`);
