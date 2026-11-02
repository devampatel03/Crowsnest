/**
 * Everything `crowsnest start`, `stop` and `doctor` need from Docker. Docker is always run with an argument list and
 * never through a shell, so nothing a user types (a folder, a port, a file name) can become a command.
 */

import { execFile, spawn } from 'node:child_process';

export const CONTAINER = 'crowsnest-api';
export const VOLUME = 'crowsnest-data';
export const DEFAULT_PORT = 8000;
const IMAGE_REPOSITORY = 'ghcr.io/devampatel03/crowsnest-api';

export interface RunResult {
  /** Exit code, or null when the program could not run or was stopped for taking too long. */
  code: number | null;
  stdout: string;
  stderr: string;
  /** Docker is not installed (the program was not found). */
  missing: boolean;
}

export interface RunOptions {
  timeoutMs?: number;
  /** Show Docker's own output (used for a download, which has its own progress bar). */
  inherit?: boolean;
}

export type Runner = (args: string[], options?: RunOptions) => Promise<RunResult>;

export const runDocker: Runner = (args, options = {}) =>
  new Promise((resolve) => {
    if (options.inherit) {
      const child = spawn('docker', args, { stdio: 'inherit', windowsHide: true });
      child.on('error', (error: NodeJS.ErrnoException) =>
        resolve({ code: null, stdout: '', stderr: error.message, missing: error.code === 'ENOENT' }),
      );
      child.on('close', (code) => resolve({ code, stdout: '', stderr: '', missing: false }));
      return;
    }
    execFile(
      'docker',
      args,
      { timeout: options.timeoutMs ?? 30_000, windowsHide: true },
      (error, stdout, stderr) => {
        const failure = error as NodeJS.ErrnoException | null;
        resolve({
          code: failure ? (typeof failure.code === 'number' ? failure.code : null) : 0,
          stdout: String(stdout),
          stderr: String(stderr),
          missing: failure?.code === 'ENOENT',
        });
      },
    );
  });

/** The backend image that matches this version of the command line, unless CROWSNEST_IMAGE names another. */
export function imageRef(version: string, env: NodeJS.ProcessEnv = process.env): string {
  return env.CROWSNEST_IMAGE?.trim() || `${IMAGE_REPOSITORY}:${version}`;
}

export function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`"${value}" is not a port number. Use a number from 1 to 65535.`);
  }
  return port;
}

export interface RunArgsInput {
  image: string;
  port: number;
  /** Folder on this machine that the backend may read, shared read only. */
  projects: string;
  envFile?: string;
}

/**
 * The backend listens on this machine only (it has no sign-in), keeps its data in a named volume, and sees one
 * folder of the user's projects, read only.
 */
export function buildRunArgs({ image, port, projects, envFile }: RunArgsInput): string[] {
  return [
    'run',
    '--detach',
    '--name', CONTAINER,
    '--restart', 'unless-stopped',
    '--label', `crowsnest.projects=${projects}`,
    '--publish', `127.0.0.1:${port}:8000`,
    '--volume', `${VOLUME}:/data`,
    '--volume', `${projects}:/projects:ro`,
    ...(envFile ? ['--env-file', envFile] : []),
    image,
  ];
}

export interface ContainerState {
  running: boolean;
  image: string;
  /** The folder it was started with, from the label `start` puts on it. */
  projects: string;
}

/** The container this command manages, or null when there is none. */
export async function inspectContainer(run: Runner): Promise<ContainerState | null> {
  const result = await run([
    'inspect',
    '--format', '{{.State.Running}}|{{.Config.Image}}|{{index .Config.Labels "crowsnest.projects"}}',
    CONTAINER,
  ]);
  if (result.code !== 0) return null;
  const [running = '', image = '', ...rest] = result.stdout.trim().split('|');
  return { running: running === 'true', image, projects: rest.join('|') };
}
