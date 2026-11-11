/**
 * A backend in Docker cannot read the user's folders by their usual path: it sees one shared folder at /projects.
 * These helpers turn a path on this machine into the path the backend must be given.
 */

import path from 'node:path';
import { api } from '../api.js';
import { getConfig } from '../config.js';

export class OutsideSharedFolderError extends Error {
  constructor(folder: string, shared: string) {
    super(
      `${folder} is not inside the folder Crowsnest shares with Docker (${shared}).\n` +
        `Share a folder that contains it: crowsnest start --projects <folder>`,
    );
    this.name = 'OutsideSharedFolderError';
  }
}

/** `hostPath` as the backend sees it, given the folder shared from this machine and where it appears in the backend. */
export function toBackendPath(
  hostPath: string,
  sharedFolder: string,
  backendRoot: string,
  flavour: path.PlatformPath = path,
): string {
  const folder = flavour.resolve(hostPath);
  const shared = flavour.resolve(sharedFolder);
  const relative = flavour.relative(shared, folder);
  if (relative.split(flavour.sep)[0] === '..' || flavour.isAbsolute(relative)) {
    throw new OutsideSharedFolderError(folder, shared);
  }
  const parts = relative === '' ? [] : relative.split(flavour.sep);
  return [backendRoot.replace(/\/+$/, ''), ...parts].join('/');
}

/**
 * The path to give the backend for a folder on this machine. A backend that is not in Docker (run from source, or
 * somewhere else) reads the same path, so it is returned unchanged.
 */
export async function backendPath(hostPath: string): Promise<string> {
  const health = await api.health().catch(() => null);
  if (!health?.projects_root) return hostPath;
  // The folder `crowsnest start` saved, or else the one a Docker Compose backend says it shares. With neither known the
  // path goes as typed: the backend maps a name or a path it can see, and otherwise says where it looks and how to share more.
  const shared = getConfig().sharedFolder || health.projects_host;
  if (!shared) return hostPath;
  return toBackendPath(hostPath, shared, health.projects_root);
}
