import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  health: null as null | { status: string; version: string; projects_root?: string | null },
  shared: '',
}));

vi.mock('../api.js', () => ({
  api: {
    health: async () => {
      if (!state.health) throw new Error('nothing answers');
      return state.health;
    },
  },
}));
vi.mock('../config.js', () => ({ getConfig: () => ({ sharedFolder: state.shared }) }));

import { OutsideSharedFolderError, backendPath, toBackendPath } from './shared.js';

describe('toBackendPath', () => {
  it('maps a folder inside the shared folder', () => {
    expect(toBackendPath('/home/me/code/app', '/home/me/code', '/projects', path.posix)).toBe('/projects/app');
    expect(toBackendPath('/home/me/code/a/b', '/home/me/code', '/projects/', path.posix)).toBe('/projects/a/b');
  });

  it('maps the shared folder itself to the root', () => {
    expect(toBackendPath('/home/me/code', '/home/me/code/', '/projects', path.posix)).toBe('/projects');
  });

  it('refuses a folder outside the shared folder, including one that only shares a prefix', () => {
    expect(() => toBackendPath('/home/me/other', '/home/me/code', '/projects', path.posix)).toThrow(OutsideSharedFolderError);
    expect(() => toBackendPath('/home/me/code-old/app', '/home/me/code', '/projects', path.posix)).toThrow(OutsideSharedFolderError);
    expect(() => toBackendPath('/home/me', '/home/me/code', '/projects', path.posix)).toThrow(/crowsnest start --projects/);
  });

  it('accepts a folder whose name merely starts with two dots', () => {
    expect(toBackendPath('/home/me/code/..cache', '/home/me/code', '/projects', path.posix)).toBe('/projects/..cache');
  });

  it('handles Windows paths: backslashes, drive-letter case, and another drive', () => {
    expect(toBackendPath('C:\\Users\\Me\\code\\app', 'c:\\users\\me\\code', '/projects', path.win32)).toBe('/projects/app');
    expect(toBackendPath('C:\\Users\\Me\\code\\a\\b', 'C:\\Users\\Me\\code', '/projects', path.win32)).toBe('/projects/a/b');
    expect(() => toBackendPath('D:\\work\\app', 'C:\\Users\\Me\\code', '/projects', path.win32)).toThrow(OutsideSharedFolderError);
  });
});

describe('backendPath', () => {
  beforeEach(() => {
    state.health = null;
    state.shared = '';
  });

  it('leaves the path alone when no backend answers, so the real error is the connection one', async () => {
    expect(await backendPath('/home/me/code/app')).toBe('/home/me/code/app');
  });

  it('leaves the path alone for a backend that is not in Docker', async () => {
    state.health = { status: 'ok', version: '0.1.0', projects_root: null };
    expect(await backendPath('/home/me/code/app')).toBe('/home/me/code/app');
  });

  it('explains what to do when Docker is in use but no folder is recorded', async () => {
    state.health = { status: 'ok', version: '0.1.0', projects_root: '/projects' };
    await expect(backendPath('/home/me/code/app')).rejects.toThrow(/crowsnest start --projects/);
  });

  it('translates for a Docker backend', async () => {
    state.health = { status: 'ok', version: '0.1.0', projects_root: '/projects' };
    state.shared = path.resolve('/home/me/code');
    expect(await backendPath(path.resolve('/home/me/code/app'))).toBe(
      toBackendPath(path.resolve('/home/me/code/app'), path.resolve('/home/me/code'), '/projects'),
    );
  });
});
