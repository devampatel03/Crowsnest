// Runs test-e2e/suite.ts inside a real VS Code. Uses the VS Code you already have installed, so nothing is downloaded.
//   npm run test:e2e            (set CROWSNEST_VSCODE to the Code executable if it is not found)
//   npm run test:e2e -- --keep  (leave the editor workspace on disk to look at)
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startMockApi } from './mock-api.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgDir = path.resolve(here, '..');
const keep = process.argv.includes('--keep');

function findVsCode() {
  if (process.env.CROWSNEST_VSCODE) return process.env.CROWSNEST_VSCODE;
  const candidates = [
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code', 'Code.exe'),
    'C:\\Program Files\\Microsoft VS Code\\Code.exe',
    '/Applications/Visual Studio Code.app/Contents/MacOS/Electron',
    '/usr/share/code/code',
    '/usr/bin/code',
  ].filter(Boolean);
  const found = candidates.find((c) => fs.existsSync(c));
  if (!found) {
    console.error('VS Code not found. Install it, or set CROWSNEST_VSCODE to its executable.');
    process.exit(2);
  }
  return found;
}

const tsc = path.join(pkgDir, 'node_modules', 'typescript', 'bin', 'tsc');
console.log('Compiling the extension and the editor tests…');
execFileSync(process.execPath, [tsc, '-p', pkgDir], { stdio: 'inherit' });
execFileSync(process.execPath, [tsc, '-p', path.join(pkgDir, 'tsconfig.e2e.json')], { stdio: 'inherit' });

const api = await startMockApi();
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'crowsnest-e2e-'));
const workspace = path.join(work, 'workspace');
fs.cpSync(path.join(here, 'fixtures'), workspace, { recursive: true });
fs.mkdirSync(path.join(workspace, '.vscode'));
fs.writeFileSync(
  path.join(workspace, '.vscode', 'settings.json'),
  JSON.stringify({ 'crowsnest.apiUrl': api.url, 'crowsnest.riskThreshold': 0.5, 'crowsnest.enabled': true }, null, 2)
);
const resultFile = path.join(work, 'result.json');

const env = { ...process.env, CROWSNEST_E2E_RESULT: resultFile };
delete env.ELECTRON_RUN_AS_NODE;

const args = [
  workspace,
  `--extensionDevelopmentPath=${pkgDir}`,
  `--extensionTestsPath=${path.join(pkgDir, 'out-e2e', 'suite.js')}`,
  `--user-data-dir=${path.join(work, 'user-data')}`,
  `--extensions-dir=${path.join(work, 'extensions')}`,
  '--disable-extensions',
  '--disable-workspace-trust',
  '--skip-welcome',
  '--skip-release-notes',
  '--no-sandbox',
];

console.log('Starting VS Code with the extension…');
// CROWSNEST_E2E_VERBOSE=1 shows VS Code's own output, for debugging the harness.
const child = spawn(findVsCode(), args, { env, stdio: process.env.CROWSNEST_E2E_VERBOSE ? 'inherit' : 'ignore' });
const timeout = setTimeout(() => {
  console.error('Timed out after 4 minutes; stopping VS Code.');
  child.kill();
}, 4 * 60 * 1000);

const code = await new Promise((resolve) => child.on('exit', resolve));
clearTimeout(timeout);
await api.close();

let outcome;
try {
  outcome = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
} catch {
  console.error(`No result file was written (VS Code exit code ${code}). The editor probably failed to start the tests.`);
  process.exit(1);
}

for (const r of outcome.results) {
  console.log(`${r.ok ? '  PASS' : '  FAIL'}  ${r.name}${r.ok ? '' : `\n          ${r.error}`}`);
}
console.log(`\n${outcome.results.length - outcome.failed} passed, ${outcome.failed} failed`);
if (keep) console.log(`Workspace kept at ${workspace}`);
else fs.rmSync(work, { recursive: true, force: true });
process.exit(outcome.failed ? 1 : 0);
