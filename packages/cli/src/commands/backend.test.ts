import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Health } from '../api.js';

const config = vi.hoisted(() => ({ apiUrl: 'http://localhost:8000', sharedFolder: '' }) as Record<string, string>);

vi.mock('../config.js', () => ({
  getConfig: () => ({ ...config }),
  setConfig: (key: string, value: string) => {
    config[key] = value;
  },
}));

import { Deps, StartError, doctorCommand, startCommand, stopCommand } from './backend.js';
import type { RunResult } from '../backend/docker.js';

const ok = (stdout = ''): RunResult => ({ code: 0, stdout, stderr: '', missing: false });
const fail = (stderr = ''): RunResult => ({ code: 1, stdout: '', stderr, missing: false });
const HEALTH: Health = { status: 'ok', version: '0.1.0', projects_root: '/projects' };
const PROJECTS = path.resolve('/home/me/code');
const IMAGE = 'ghcr.io/devampatel03/crowsnest-api:0.1.0';

interface Fake {
  deps: Deps;
  calls: string[][];
  logs: string[];
}

/** A Docker that answers from a table keyed by the first arguments, so each test says only what is different. */
function fake(
  docker: Record<string, RunResult | (() => RunResult)> = {},
  healthAnswers: (Health | null)[] = [HEALTH],
  extra: Partial<Deps> = {},
): Fake {
  const calls: string[][] = [];
  const logs: string[] = [];
  const answers = [...healthAnswers];
  const deps: Deps = {
    run: async (args) => {
      calls.push(args);
      const answer = docker[args.slice(0, 2).join(' ')] ?? docker[args[0] ?? ''] ?? ok();
      return typeof answer === 'function' ? answer() : answer;
    },
    health: async () => (answers.length > 1 ? answers.shift()! : (answers[0] ?? null)),
    reachable: async () => true,
    log: (line) => logs.push(line),
    sleep: async () => undefined,
    cwd: () => PROJECTS,
    home: () => path.resolve('/home/me'),
    isDirectory: () => true,
    env: {},
    ...extra,
  };
  return { deps, calls, logs };
}

beforeEach(() => {
  config.apiUrl = 'http://localhost:8000';
  config.sharedFolder = '';
});

describe('startCommand', () => {
  it('starts a fresh backend: downloads the image, runs it read only, waits, and remembers the folder', async () => {
    const f = fake({ inspect: fail(), 'image inspect': fail() }, [null, null, HEALTH]);
    await startCommand({}, f.deps);

    expect(f.calls.some((c) => c[0] === 'pull' && c[1] === IMAGE)).toBe(true);
    const run = f.calls.find((c) => c[0] === 'run')!;
    expect(run).toContain(`${PROJECTS}:/projects:ro`);
    expect(run).toContain('127.0.0.1:8000:8000');
    expect(run.at(-1)).toBe(IMAGE);
    expect(config.sharedFolder).toBe(PROJECTS);
    expect(f.logs.join('\n')).toContain('Crowsnest is running at http://127.0.0.1:8000');
  });

  it('does not download an image that is already here', async () => {
    const f = fake({ inspect: fail() }, [null, HEALTH]);
    await startCommand({}, f.deps);
    expect(f.calls.some((c) => c[0] === 'pull')).toBe(false);
  });

  it('does nothing when the same backend is already running', async () => {
    const f = fake({ inspect: ok(`true|${IMAGE}|${PROJECTS}\n`) });
    await startCommand({}, f.deps);
    expect(f.calls.some((c) => c[0] === 'run' || c[0] === 'rm')).toBe(false);
    expect(f.logs.join('\n')).toContain('already running');
    expect(config.sharedFolder).toBe(PROJECTS);
  });

  it('replaces the container when another folder is asked for, keeping the data volume', async () => {
    const f = fake({ inspect: ok(`true|${IMAGE}|/elsewhere\n`) }, [HEALTH]);
    await startCommand({ projects: PROJECTS }, f.deps);
    expect(f.calls).toContainEqual(['rm', '--force', 'crowsnest-api']);
    expect(f.calls.some((c) => c[0] === 'run')).toBe(true);
    expect(f.calls.some((c) => c[0] === 'volume')).toBe(false);
  });

  it('points the command line at another port, and back again on the default port', async () => {
    const f = fake({ inspect: fail() }, [null, HEALTH]);
    await startCommand({ port: '8123' }, f.deps);
    expect(config.apiUrl).toBe('http://127.0.0.1:8123');
    const g = fake({ inspect: fail() }, [null, HEALTH]);
    await startCommand({}, g.deps);
    expect(config.apiUrl).toBe('http://127.0.0.1:8000');
  });

  it('does not touch a custom address when started on the default port', async () => {
    config.apiUrl = 'https://crowsnest.example.com';
    await startCommand({}, fake({ inspect: fail() }, [null, HEALTH]).deps);
    expect(config.apiUrl).toBe('https://crowsnest.example.com');
  });

  it('tells the user when Docker is not installed or not running', async () => {
    const missing = fake({ info: { code: null, stdout: '', stderr: '', missing: true } });
    await expect(startCommand({}, missing.deps)).rejects.toThrow(/Docker is not installed/);
    const stopped = fake({ info: fail('cannot connect') });
    await expect(startCommand({}, stopped.deps)).rejects.toThrow(/not running/);
    expect(stopped.calls.some((c) => c[0] === 'run')).toBe(false);
  });

  it('refuses to share a whole drive, a missing folder, or a missing env file', async () => {
    const root = path.parse(PROJECTS).root;
    await expect(startCommand({ projects: root }, fake().deps)).rejects.toThrow(/not a whole drive/);
    await expect(startCommand({}, fake({}, [HEALTH], { isDirectory: () => false }).deps)).rejects.toThrow(/is not a folder/);
    await expect(startCommand({ envFile: path.resolve('does-not-exist.env') }, fake().deps)).rejects.toThrow(/does not exist/);
  });

  it('refuses to start over something else that already answers on the port', async () => {
    const f = fake({ inspect: fail() }, [HEALTH]);
    await expect(startCommand({}, f.deps)).rejects.toThrow(/already using port 8000/);
    expect(f.calls.some((c) => c[0] === 'run')).toBe(false);
  });

  it('explains a failed download and a busy port', async () => {
    const noNet = fake({ inspect: fail(), 'image inspect': fail(), pull: fail() }, [null]);
    await expect(startCommand({}, noNet.deps)).rejects.toThrow(/Could not download/);
    const busy = fake({ inspect: fail(), run: fail('Bind for 127.0.0.1:8000 failed: port is already allocated') }, [null]);
    await expect(startCommand({}, busy.deps)).rejects.toThrow(/--port 8001/);
    expect(busy.calls).toContainEqual(['rm', '--force', 'crowsnest-api']);
  });

  it('shows the container log when it never becomes ready', async () => {
    vi.useFakeTimers();
    try {
      let now = 0;
      vi.setSystemTime(now);
      const f = fake({ inspect: fail(), logs: ok('boom in startup') }, [null], {
        sleep: async () => {
          now += 30_000;
          vi.setSystemTime(now);
        },
      });
      const outcome = startCommand({}, f.deps);
      await expect(outcome).rejects.toThrow(/boom in startup/);
      await expect(outcome).rejects.toBeInstanceOf(StartError);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('stopCommand', () => {
  it('removes the container, clears the shared folder and keeps the data', async () => {
    config.sharedFolder = PROJECTS;
    const f = fake({ inspect: ok(`true|${IMAGE}|${PROJECTS}\n`) });
    await stopCommand({}, f.deps);
    expect(f.calls).toContainEqual(['rm', '--force', 'crowsnest-api']);
    expect(f.calls.some((c) => c[0] === 'volume')).toBe(false);
    expect(config.sharedFolder).toBe('');
  });

  it('says so when there is nothing to stop', async () => {
    const f = fake({ inspect: fail() });
    await stopCommand({}, f.deps);
    expect(f.logs.join('\n')).toContain('was not running');
  });

  it('deletes the data only when asked', async () => {
    const f = fake({ inspect: fail() });
    await stopCommand({ deleteData: true }, f.deps);
    expect(f.calls).toContainEqual(['volume', 'rm', 'crowsnest-data']);
  });
});

describe('doctorCommand', () => {
  const healthy = { 'inspect': ok(`true|${IMAGE}|${PROJECTS}\n`), 'version': ok('27.0.3') };

  it('reports nothing wrong for a healthy setup', async () => {
    config.sharedFolder = PROJECTS;
    const f = fake(healthy);
    expect(await doctorCommand(f.deps)).toBe(0);
    expect(f.logs.join('\n')).toContain('Nothing is wrong');
  });

  it('fails, and says how to fix it, when nothing answers', async () => {
    const f = fake(healthy, [null]);
    expect(await doctorCommand(f.deps)).toBe(1);
    expect(f.logs.join('\n')).toContain('crowsnest start');
  });

  it('says Docker is not running instead of failing quietly', async () => {
    const f = fake({ ...healthy, info: fail('cannot connect') }, [null]);
    expect(await doctorCommand(f.deps)).toBe(1);
    expect(f.logs.join('\n')).toContain('Start Docker Desktop');
  });

  it('treats missing Docker as a warning when a backend answers anyway', async () => {
    const f = fake({ version: { code: null, stdout: '', stderr: '', missing: true } }, [{ status: 'ok', version: '0.1.0', projects_root: null }]);
    expect(await doctorCommand(f.deps)).toBe(0);
    expect(f.logs.join('\n')).toContain('not installed');
  });

  it('flags a shared folder that is missing or not recorded', async () => {
    const none = fake(healthy);
    expect(await doctorCommand(none.deps)).toBe(1);
    expect(none.logs.join('\n')).toContain('no shared folder is recorded');
    config.sharedFolder = PROJECTS;
    const gone = fake(healthy, [HEALTH], { isDirectory: () => false });
    expect(await doctorCommand(gone.deps)).toBe(1);
    expect(gone.logs.join('\n')).toContain('no longer exists');
  });

  it('warns about a version mismatch and unreachable lookups without failing', async () => {
    config.sharedFolder = PROJECTS;
    const f = fake(healthy, [{ ...HEALTH, version: '0.0.9' }], { reachable: async () => false });
    expect(await doctorCommand(f.deps)).toBe(0);
    const out = f.logs.join('\n');
    expect(out).toContain('the backend is 0.0.9');
    expect(out).toContain('not reachable');
  });
});
