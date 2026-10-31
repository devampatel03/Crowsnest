import { describe, expect, it } from 'vitest';
import { CONTAINER, Runner, buildRunArgs, imageRef, inspectContainer, parsePort } from './docker.js';

describe('parsePort', () => {
  it.each(['1', '8000', '65535'])('accepts %s', (value) => {
    expect(parsePort(value)).toBe(Number(value));
  });

  it.each(['0', '65536', '-1', '80.5', 'abc', '', '8000; rm', ' '])('refuses %j', (value) => {
    expect(() => parsePort(value)).toThrow(/not a port number/);
  });
});

describe('imageRef', () => {
  it('pins the image to the version of the command line', () => {
    expect(imageRef('0.1.0', {})).toBe('ghcr.io/devampatel03/crowsnest-api:0.1.0');
  });

  it('lets CROWSNEST_IMAGE name another image, for a local build', () => {
    expect(imageRef('0.1.0', { CROWSNEST_IMAGE: ' crowsnest-api:dev ' })).toBe('crowsnest-api:dev');
    expect(imageRef('0.1.0', { CROWSNEST_IMAGE: '  ' })).toBe('ghcr.io/devampatel03/crowsnest-api:0.1.0');
  });
});

describe('buildRunArgs', () => {
  const args = buildRunArgs({ image: 'img:1', port: 8123, projects: 'C:\\Users\\me\\code' });

  it('listens on this machine only', () => {
    expect(args).toContain('127.0.0.1:8123:8000');
    expect(args.some((a) => /^(0\.0\.0\.0)?:?\d+:8000$/.test(a))).toBe(false);
  });

  it('shares the folder read only and keeps data in a volume', () => {
    expect(args).toContain('C:\\Users\\me\\code:/projects:ro');
    expect(args).toContain('crowsnest-data:/data');
  });

  it('labels the container with the folder and ends with the image', () => {
    expect(args).toContain('crowsnest.projects=C:\\Users\\me\\code');
    expect(args.at(-1)).toBe('img:1');
    expect(args).toContain(CONTAINER);
  });

  it('passes an env file only when given', () => {
    expect(args).not.toContain('--env-file');
    const withFile = buildRunArgs({ image: 'img:1', port: 8000, projects: '/p', envFile: '/keys.env' });
    expect(withFile.slice(withFile.indexOf('--env-file'), withFile.indexOf('--env-file') + 2)).toEqual(['--env-file', '/keys.env']);
    expect(withFile.at(-1)).toBe('img:1');
  });

  it('treats a hostile folder name as one argument, never as a command', () => {
    const hostile = buildRunArgs({ image: 'img:1', port: 8000, projects: '/p; rm -rf / #' });
    expect(hostile).toContain('/p; rm -rf / #:/projects:ro');
  });
});

describe('inspectContainer', () => {
  const run = (code: number, stdout = ''): Runner => async () => ({ code, stdout, stderr: '', missing: false });

  it('reads the state of the container', async () => {
    expect(await inspectContainer(run(0, 'true|img:1|/home/me/code\n'))).toEqual({
      running: true,
      image: 'img:1',
      projects: '/home/me/code',
    });
    expect(await inspectContainer(run(0, 'false|img:1|\n'))).toEqual({ running: false, image: 'img:1', projects: '' });
  });

  it('keeps a folder name that contains the separator', async () => {
    expect((await inspectContainer(run(0, 'true|img:1|/a|b')))?.projects).toBe('/a|b');
  });

  it('returns null when there is no container', async () => {
    expect(await inspectContainer(run(1))).toBeNull();
  });
});
