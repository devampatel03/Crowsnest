/**
 * End-to-end checks that run INSIDE a real VS Code Extension Host, against the real extension and a mock API.
 * Started by run.mjs. Results go to the file named by CROWSNEST_E2E_RESULT.
 */
import * as vscode from 'vscode';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';

interface Flag {
  line: number;
  packageName: string;
  probability: number;
  severity: string;
}
interface Api {
  getAppliedFlags(uri: string): readonly Flag[];
}
interface Recorded {
  method: string;
  path: string;
  body: { package?: string; ecosystem?: string };
}

const results: { name: string; ok: boolean; error?: string }[] = [];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function mockUrl(): string {
  return vscode.workspace.getConfiguration('crowsnest').get<string>('apiUrl')!;
}

function callMock<T>(method: 'GET' | 'POST', route: string, body?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const u = new URL(mockUrl() + route);
    const payload = body ? JSON.stringify(body) : undefined;
    const req = http.request(
      { hostname: u.hostname, port: u.port, path: u.pathname, method, headers: { 'Content-Type': 'application/json' } },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve(JSON.parse(data) as T));
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const mockRequests = () => callMock<Recorded[]>('GET', '/__requests');
const setMode = (mode: 'ok' | 'down') => callMock('POST', '/__mode', { mode });

/** Poll until the condition holds; the extension debounces by 1 s and then calls the API. */
async function waitFor<T>(what: string, probe: () => T | Promise<T>, accept: (v: T) => boolean, ms = 12000): Promise<T> {
  const end = Date.now() + ms;
  let last = await probe();
  while (!accept(last)) {
    if (Date.now() > end) {
      throw new Error(`Timed out waiting for ${what}. Last value: ${JSON.stringify(last)}`);
    }
    await sleep(250);
    last = await probe();
  }
  return last;
}

async function openFixture(name: string): Promise<vscode.TextEditor> {
  const root = vscode.workspace.workspaceFolders![0].uri.fsPath;
  const doc = await vscode.workspace.openTextDocument(path.join(root, name));
  return vscode.window.showTextDocument(doc);
}

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (err) {
    results.push({ name, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}

const summary = (flags: readonly Flag[]) => flags.map((f) => `${f.line}:${f.packageName}:${f.severity}`).sort();

export async function run(): Promise<void> {
  const ext = vscode.extensions.getExtension('crowsnest.crowsnest-vscode')!;
  let api!: Api;

  await test('the extension is found and activates', async () => {
    assert.ok(ext, 'extension crowsnest.crowsnest-vscode not found');
    api = (await ext.activate()) as Api;
    assert.equal(ext.isActive, true);
    assert.equal(typeof api.getAppliedFlags, 'function');
  });

  await test('registers its three commands', async () => {
    const all = await vscode.commands.getCommands(true);
    for (const c of ['crowsnest.scanFile', 'crowsnest.investigatePackage', 'crowsnest.openDashboard']) {
      assert.ok(all.includes(c), `${c} missing`);
    }
  });

  await test('flags risky imports in a TypeScript file, by severity, and leaves the rest alone', async () => {
    const editor = await openFixture('sample.ts');
    const uri = editor.document.uri.toString();
    const flags = await waitFor('flags on sample.ts', () => api.getAppliedFlags(uri), (f) => f.length >= 3);
    assert.deepEqual(summary(flags), ['0:evil-pkg:critical', '1:meh-pkg:high', '2:lowish-pkg:medium']);
  });

  await test('never asks the API about builtins, relative imports or clean-looking comments of them', async () => {
    const asked = (await mockRequests()).filter((r) => r.path === '/api/veto').map((r) => r.body.package);
    for (const banned of ['fs', 'path', 'node', 'child_process', './local', 'os']) {
      assert.ok(!asked.includes(banned), `API was asked about ${banned}: ${JSON.stringify(asked)}`);
    }
    assert.ok(asked.includes('evil-pkg'));
  });

  await test('flags a Python file and asks the PyPI ecosystem, not npm', async () => {
    const editor = await openFixture('sample.py');
    const uri = editor.document.uri.toString();
    const flags = await waitFor('flags on sample.py', () => api.getAppliedFlags(uri), (f) => f.length >= 1);
    assert.deepEqual(summary(flags), ['2:evilpy:critical']);
    const reqs = (await mockRequests()).filter((r) => r.path === '/api/veto' && r.body.package === 'evilpy');
    assert.ok(reqs.length >= 1);
    assert.equal(reqs[0].body.ecosystem, 'pypi');
    const asked = (await mockRequests()).filter((r) => r.path === '/api/veto').map((r) => r.body.package);
    assert.ok(!asked.includes('os'), 'asked about the stdlib module os');
  });

  await test('picks up a newly typed import and drops it again when deleted', async () => {
    const editor = await openFixture('sample.ts');
    const uri = editor.document.uri.toString();
    const before = api.getAppliedFlags(uri).length;
    const last = editor.document.lineCount;
    await editor.edit((e) => e.insert(new vscode.Position(last, 0), "\nimport z from 'evil-pkg';\n"));
    await waitFor('the new line to be flagged', () => api.getAppliedFlags(uri).length, (n) => n === before + 1);
    await editor.edit((e) => e.delete(new vscode.Range(new vscode.Position(last, 0), editor.document.lineAt(editor.document.lineCount - 1).range.end)));
    await waitFor('the deleted line to clear', () => api.getAppliedFlags(uri).length, (n) => n === before);
  });

  await test('re-scans straight away when the threshold setting changes', async () => {
    const editor = await openFixture('sample.ts');
    const uri = editor.document.uri.toString();
    const cfg = vscode.workspace.getConfiguration('crowsnest');
    await cfg.update('riskThreshold', 0.9, vscode.ConfigurationTarget.Workspace);
    const strict = await waitFor('only the critical flag at 0.9', () => api.getAppliedFlags(uri), (f) => f.length === 1);
    assert.equal(strict[0].packageName, 'evil-pkg');
    await cfg.update('riskThreshold', 0.5, vscode.ConfigurationTarget.Workspace);
    await waitFor('all three flags again at 0.5', () => api.getAppliedFlags(uri), (f) => f.length === 3);
  });

  await test('turning the extension off clears the flags, turning it on restores them', async () => {
    const editor = await openFixture('sample.ts');
    const uri = editor.document.uri.toString();
    const cfg = vscode.workspace.getConfiguration('crowsnest');
    await cfg.update('enabled', false, vscode.ConfigurationTarget.Workspace);
    await waitFor('flags cleared', () => api.getAppliedFlags(uri).length, (n) => n === 0);
    await cfg.update('enabled', true, vscode.ConfigurationTarget.Workspace);
    await waitFor('flags restored', () => api.getAppliedFlags(uri).length, (n) => n === 3);
  });

  await test('scan-file and investigate commands run and reach the API', async () => {
    const editor = await openFixture('sample.ts');
    editor.selection = new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0));
    const before = (await mockRequests()).length;
    await vscode.commands.executeCommand('crowsnest.scanFile');
    const afterScan = await mockRequests();
    assert.ok(afterScan.length > before, 'scanFile made no API calls');
    await vscode.commands.executeCommand('crowsnest.investigatePackage');
    const inv = (await mockRequests()).filter((r) => r.path === '/api/investigate');
    assert.ok(inv.length >= 1 && inv[inv.length - 1].body.package === 'evil-pkg', `investigate: ${JSON.stringify(inv)}`);
  });

  await test('an unreachable API shows no flags, does not crash, and is not hammered', async () => {
    await setMode('down');
    const editor = await openFixture('offline.ts');
    const uri = editor.document.uri.toString();
    await sleep(2500);
    assert.deepEqual(api.getAppliedFlags(uri), []);
    const countFor = async () => (await mockRequests()).filter((r) => r.path === '/api/veto' && r.body.package === 'offline-only-pkg').length;
    const first = await countFor();
    assert.ok(first >= 1, 'the extension never tried the API');
    // Three more edits inside the 30 s miss window must not trigger three more lookups.
    for (let i = 0; i < 3; i++) {
      await editor.edit((e) => e.insert(new vscode.Position(editor.document.lineCount, 0), `// edit ${i}\n`));
      await sleep(1500);
    }
    assert.equal(await countFor(), first, 'failed lookup was retried on every edit');
    await setMode('ok');
  });

  const failed = results.filter((r) => !r.ok);
  const out = process.env.CROWSNEST_E2E_RESULT;
  if (out) {
    fs.writeFileSync(out, JSON.stringify({ results, failed: failed.length }, null, 2));
  }
  if (failed.length > 0) {
    throw new Error(`${failed.length} editor test(s) failed`);
  }
}
