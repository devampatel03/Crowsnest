/**
 * crowsnest start | stop | doctor
 *
 * Runs the Crowsnest backend in Docker on this machine so the other commands have something to talk to. Nothing is
 * started unless the user types `start`, and the backend listens on this machine only.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { Health } from '../api.js';
import { getConfig, setConfig } from '../config.js';
import {
  CONTAINER,
  DEFAULT_PORT,
  VOLUME,
  Runner,
  buildRunArgs,
  imageRef,
  inspectContainer,
  parsePort,
  runDocker,
} from '../backend/docker.js';
import { theme } from '../display/theme.js';
import { icons } from '../display/icons.js';

const cliVersion = (createRequire(import.meta.url)('../../package.json') as { version: string }).version;

export interface Deps {
  run: Runner;
  /** The backend's /health at an address, or null when nothing answers. */
  health: (apiUrl: string) => Promise<Health | null>;
  /** True when an address answers an HTTP request at all (used to tell whether the internet lookups work). */
  reachable: (url: string) => Promise<boolean>;
  log: (line: string) => void;
  sleep: (ms: number) => Promise<void>;
  cwd: () => string;
  home: () => string;
  isDirectory: (folder: string) => boolean;
  env: NodeJS.ProcessEnv;
}

export const realDeps: Deps = {
  run: runDocker,
  health: async (apiUrl) => {
    try {
      const response = await fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(3000) });
      return response.ok ? ((await response.json()) as Health) : null;
    } catch {
      return null;
    }
  },
  reachable: async (url) => {
    try {
      await fetch(url, { signal: AbortSignal.timeout(5000) });
      return true;
    } catch {
      return false;
    }
  },
  log: (line) => console.log(line),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  cwd: () => process.cwd(),
  home: () => os.homedir(),
  isDirectory: (folder) => {
    try {
      return fs.statSync(folder).isDirectory();
    } catch {
      return false;
    }
  },
  env: process.env,
};

/** Raised for a problem the user can fix; the message says how. The command line prints it and exits with 2. */
export class StartError extends Error {}

export interface StartOptions {
  port?: string;
  projects?: string;
  envFile?: string;
}

const READY_WAIT_MS = 60_000;

export async function startCommand(options: StartOptions = {}, deps: Deps = realDeps): Promise<void> {
  const port = parsePort(options.port ?? String(DEFAULT_PORT));
  const projects = path.resolve(options.projects ?? deps.cwd());
  if (!deps.isDirectory(projects)) throw new StartError(`${projects} is not a folder.`);
  if (path.parse(projects).root === projects) {
    throw new StartError('Share a project folder, not a whole drive. Use: crowsnest start --projects <folder>');
  }
  const envFile = options.envFile ? path.resolve(options.envFile) : undefined;
  if (envFile && !fs.existsSync(envFile)) throw new StartError(`${envFile} does not exist.`);

  await requireDocker(deps);

  const image = imageRef(cliVersion, deps.env);
  const apiUrl = `http://127.0.0.1:${port}`;
  const existing = await inspectContainer(deps.run);

  if (existing?.running && existing.image === image && existing.projects === projects && (await deps.health(apiUrl))) {
    remember(projects, port);
    deps.log(theme.success(`${icons.ok} Crowsnest is already running at ${apiUrl}`));
    deps.log(theme.muted(`  Sharing ${projects} (read only). Stop it with: crowsnest stop`));
    return;
  }

  if (!existing && (await deps.health(apiUrl))) {
    throw new StartError(
      `Something that answers like Crowsnest is already using port ${port}, and it was not started by this command.\n` +
        `Use it as it is, or choose another port: crowsnest start --port ${port + 1}`,
    );
  }

  if (existing) {
    // Data lives in a volume, so replacing the container (a new folder, a new version) loses nothing.
    deps.log(theme.muted('Replacing the running Crowsnest with the options you gave...'));
    await deps.run(['rm', '--force', CONTAINER]);
  }

  const have = await deps.run(['image', 'inspect', image]);
  if (have.code !== 0) {
    deps.log(theme.muted(`Downloading ${image} (once; later starts are instant)...`));
    const pulled = await deps.run(['pull', image], { inherit: true });
    if (pulled.code !== 0) {
      throw new StartError(
        `Could not download ${image}.\n` +
          'Check your internet connection. If this version was only just released, wait a few minutes and try again.',
      );
    }
  }

  const started = await deps.run(buildRunArgs({ image, port, projects, envFile }));
  if (started.code !== 0) {
    // Docker keeps the container it failed to start; leave nothing behind for the next attempt to trip on.
    await deps.run(['rm', '--force', CONTAINER]);
    throw new StartError(explainRunFailure(started.stderr, port));
  }

  deps.log(theme.muted('Waiting for Crowsnest to be ready...'));
  const deadline = Date.now() + READY_WAIT_MS;
  while (Date.now() < deadline) {
    if (await deps.health(apiUrl)) {
      remember(projects, port);
      deps.log(theme.success(`${icons.ok} Crowsnest is running at ${apiUrl}`));
      deps.log(`  Sharing ${projects} (read only). Scan from any folder inside it, for example:`);
      deps.log(theme.muted('    crowsnest scan .'));
      deps.log(theme.muted('  Stop it with: crowsnest stop     Check it with: crowsnest doctor'));
      if (path.resolve(projects) === path.resolve(deps.home())) {
        deps.log(theme.status.warning(`${icons.warn} You are sharing your whole home folder. A narrower folder is safer.`));
      }
      return;
    }
    await deps.sleep(1000);
  }
  const logs = await deps.run(['logs', '--tail', '20', CONTAINER]);
  throw new StartError(
    `Crowsnest started but did not answer within ${READY_WAIT_MS / 1000} seconds.\n` +
      `${(logs.stdout + logs.stderr).trim()}\nRun: crowsnest doctor`,
  );
}

export interface StopOptions {
  deleteData?: boolean;
}

export async function stopCommand(options: StopOptions = {}, deps: Deps = realDeps): Promise<void> {
  await requireDocker(deps);
  const existing = await inspectContainer(deps.run);
  if (existing) {
    await deps.run(['rm', '--force', CONTAINER]);
    deps.log(theme.success(`${icons.ok} Crowsnest stopped.`));
  } else {
    deps.log(theme.muted('Crowsnest was not running.'));
  }
  setConfig('sharedFolder', '');
  if (options.deleteData) {
    const removed = await deps.run(['volume', 'rm', VOLUME]);
    deps.log(
      removed.code === 0
        ? theme.success(`${icons.ok} Stored data deleted.`)
        : theme.muted('There was no stored data to delete.'),
    );
  } else {
    deps.log(theme.muted('Your stored data is kept. Delete it with: crowsnest stop --delete-data'));
  }
}

type Level = 'ok' | 'warn' | 'fail';
interface Finding {
  level: Level;
  name: string;
  detail: string;
}

export async function doctorCommand(deps: Deps = realDeps): Promise<number> {
  const findings: Finding[] = [];
  const add = (level: Level, name: string, detail: string): void => {
    findings.push({ level, name, detail });
  };
  const { apiUrl, sharedFolder } = getConfig();

  const client = await deps.run(['version', '--format', '{{.Client.Version}}']);
  const dockerInstalled = !client.missing;
  if (!dockerInstalled) {
    add('warn', 'Docker', 'not installed. It is only needed for `crowsnest start`: https://docs.docker.com/get-docker/');
  } else {
    add('ok', 'Docker', `installed (${client.stdout.trim() || 'version unknown'})`);
    const engine = await deps.run(['info', '--format', '{{.ServerVersion}}']);
    if (engine.code === 0) add('ok', 'Docker is running', `engine ${engine.stdout.trim()}`);
    else add('fail', 'Docker is running', 'Docker is installed but not running. Start Docker Desktop (or the Docker service).');

    if (engine.code === 0) {
      const container = await inspectContainer(deps.run);
      if (!container) add('warn', 'Crowsnest container', `none. Start one with: crowsnest start`);
      else if (!container.running) add('fail', 'Crowsnest container', 'exists but is not running. Run: crowsnest start');
      else add('ok', 'Crowsnest container', `running (${container.image}), sharing ${container.projects || 'nothing'}`);
    }
  }

  const health = await deps.health(apiUrl);
  if (!health) {
    add('fail', `Crowsnest at ${apiUrl}`, 'nothing answers. Start it with: crowsnest start (install and check still work as a quick check)');
  } else {
    add('ok', `Crowsnest at ${apiUrl}`, `answering (version ${health.version})`);
    if (health.version !== cliVersion) {
      add('warn', 'Versions match', `the command line is ${cliVersion} but the backend is ${health.version}. Run: crowsnest start`);
    }
    if (health.projects_root) {
      if (!sharedFolder) add('fail', 'Shared folder', 'Docker is in use but no shared folder is recorded. Run: crowsnest start --projects <folder>');
      else if (!deps.isDirectory(sharedFolder)) add('fail', 'Shared folder', `${sharedFolder} no longer exists. Run: crowsnest start --projects <folder>`);
      else add('ok', 'Shared folder', `${sharedFolder} (read only)`);
    }
  }

  const osv = await deps.reachable('https://api.osv.dev/v1/vulns/MAL-2026-2307');
  add(osv ? 'ok' : 'warn', 'Malware list (osv.dev)', osv ? 'reachable' : 'not reachable, so malware checks cannot be made right now');
  const npm = await deps.reachable('https://registry.npmjs.org/left-pad');
  add(npm ? 'ok' : 'warn', 'npm registry', npm ? 'reachable' : 'not reachable, so release checks cannot be made right now');

  deps.log('');
  for (const f of findings) {
    const icon = f.level === 'ok' ? theme.success(icons.ok) : f.level === 'warn' ? theme.status.warning(icons.warn) : theme.error(icons.fail);
    deps.log(`  ${icon} ${f.name.padEnd(26)} ${theme.muted(f.detail)}`);
  }
  deps.log('');
  const failed = findings.filter((f) => f.level === 'fail').length;
  deps.log(failed ? theme.error(`${failed} problem(s) found.`) : theme.success('Nothing is wrong.'));
  return failed ? 1 : 0;
}

function remember(projects: string, port: number): void {
  setConfig('sharedFolder', projects);
  if (port !== DEFAULT_PORT) {
    setConfig('apiUrl', `http://127.0.0.1:${port}`);
  } else if (/^http:\/\/127\.0\.0\.1:\d+$/.test(getConfig().apiUrl)) {
    // An address an earlier `start --port` set; the default port is the default address again.
    setConfig('apiUrl', `http://127.0.0.1:${DEFAULT_PORT}`);
  }
}

async function requireDocker(deps: Deps): Promise<void> {
  const engine = await deps.run(['info', '--format', '{{.ServerVersion}}']);
  if (engine.missing) {
    throw new StartError(
      'Docker is not installed. Crowsnest runs its backend in Docker: https://docs.docker.com/get-docker/\n' +
        'Without Docker you can still run `crowsnest install` and `crowsnest check`, or run Crowsnest from source.',
    );
  }
  if (engine.code !== 0) {
    throw new StartError('Docker is installed but not running. Start Docker Desktop (or the Docker service), then try again.');
  }
}

function explainRunFailure(stderr: string, port: number): string {
  if (/port is already allocated|address already in use|bind for/i.test(stderr)) {
    return `Port ${port} is already in use on this machine. Choose another: crowsnest start --port ${port + 1}`;
  }
  return `Docker could not start Crowsnest:\n${stderr.trim()}`;
}
