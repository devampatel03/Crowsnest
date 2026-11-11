/**
 * `crowsnest install` asks whether Crowsnest is running on every run, and never installs a package it could not check.
 * npm is faked: the test sees which npm commands would have run.
 */

import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const spawnMock = vi.hoisted(() => vi.fn());
const apiMock = vi.hoisted(() => ({ health: vi.fn(), vetoCheck: vi.fn() }));

vi.mock('child_process', () => ({ spawn: spawnMock }));
vi.mock('../api.js', () => ({ api: apiMock }));

import { installCommand } from './install.js';
import { StartError } from './backend.js';
import { NOT_RUNNING_FOR_INSTALL } from '../standalone/mode.js';

/** A fake npm child: `npm view` answers with no version, `npm install` succeeds. */
function fakeNpm() {
  spawnMock.mockImplementation(() => {
    const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; kill: () => void };
    child.stdout = new EventEmitter();
    child.kill = () => undefined;
    setImmediate(() => child.emit('close', 0));
    return child;
  });
}

/** The npm sub-commands that ran, such as ['view', 'install']. */
function npmCommands(): string[] {
  return spawnMock.mock.calls.map((c) => {
    const args = c[1] as string[];
    return String(args.find((a) => a === 'view' || a === 'install'));
  });
}

const approved = {
  blocked: false, package: 'left-pad', version: '1.3.0', probability: 0.05, signals: [], reason: '',
  override_flag: null, degraded: [], release_age_hours: 9000,
};

beforeEach(() => {
  vi.clearAllMocks();
  process.exitCode = undefined;
  fakeNpm();
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('crowsnest install when Crowsnest is not running', () => {
  beforeEach(() => {
    apiMock.health.mockRejectedValue(new Error('connect ECONNREFUSED'));
  });

  it('stops with the way to start it, and runs no npm command at all', async () => {
    await expect(installCommand('left-pad')).rejects.toThrow(StartError);
    await expect(installCommand('left-pad')).rejects.toThrow(/crowsnest start/);
    expect(spawnMock).not.toHaveBeenCalled();
    expect(apiMock.vetoCheck).not.toHaveBeenCalled();
  });

  it('says plainly that nothing was installed and what to do next', () => {
    expect(NOT_RUNNING_FOR_INSTALL).toMatch(/not running/);
    expect(NOT_RUNNING_FOR_INSTALL).toMatch(/Nothing was installed/);
    expect(NOT_RUNNING_FOR_INSTALL).toMatch(/1\. Start it:\s+crowsnest start/);
    expect(NOT_RUNNING_FOR_INSTALL).toMatch(/2\. Run this command again/);
  });

  it('also stops for a package that would have passed', async () => {
    apiMock.vetoCheck.mockResolvedValue(approved);
    await expect(installCommand('left-pad')).rejects.toThrow(StartError);
    expect(npmCommands()).not.toContain('install');
  });

  it('stops even with --crowsnest-acknowledge-risk', async () => {
    await expect(installCommand('left-pad', { acknowledgeRisk: true })).rejects.toThrow(StartError);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('--full stops the same way', async () => {
    await expect(installCommand('left-pad', { full: true })).rejects.toThrow(/crowsnest start/);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('asks again on the next run: a Crowsnest started in between is used', async () => {
    await expect(installCommand('left-pad')).rejects.toThrow(StartError);
    apiMock.health.mockResolvedValue({ status: 'ok' });
    apiMock.vetoCheck.mockResolvedValue(approved);
    await installCommand('left-pad');
    expect(npmCommands()).toContain('install');
    expect(apiMock.health).toHaveBeenCalledTimes(2);
  });
});

describe('crowsnest install when Crowsnest is running', () => {
  beforeEach(() => {
    apiMock.health.mockResolvedValue({ status: 'ok' });
  });

  it('installs what passed', async () => {
    apiMock.vetoCheck.mockResolvedValue(approved);
    await installCommand('left-pad@1.3.0');
    expect(npmCommands()).toContain('install');
    expect(process.exitCode).toBeUndefined();
  });

  it('does not install what was blocked, and exits 3', async () => {
    apiMock.vetoCheck.mockResolvedValue({
      ...approved, blocked: true, probability: 1, signals: ['Matches known AI hallucination pattern'], override_flag: '--crowsnest-acknowledge-risk',
    });
    await installCommand('left-pad@1.3.0');
    expect(npmCommands()).not.toContain('install');
    expect(process.exitCode).toBe(3);
  });

  it('does not install when Crowsnest stops answering part-way through, and exits 3', async () => {
    apiMock.vetoCheck.mockRejectedValue(new Error('socket hang up'));
    await installCommand('left-pad@1.3.0');
    expect(npmCommands()).not.toContain('install');
    expect(process.exitCode).toBe(3);
  });

  it('does not install when Crowsnest stops answering part-way through, with --strict too', async () => {
    apiMock.vetoCheck.mockRejectedValue(new Error('socket hang up'));
    await installCommand('left-pad@1.3.0', { strict: true });
    expect(npmCommands()).not.toContain('install');
    expect(process.exitCode).toBe(3);
  });
});

describe('crowsnest install --quick', () => {
  it('is the one way to install without Crowsnest running, and never asks the backend', async () => {
    apiMock.health.mockRejectedValue(new Error('down'));
    // The quick check reaches the network; it is not the subject here, so it is faked out of the way.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ results: [{}] }), { status: 200 })));
    await installCommand('left-pad@1.3.0', { quick: true }).catch(() => undefined);
    expect(apiMock.health).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
