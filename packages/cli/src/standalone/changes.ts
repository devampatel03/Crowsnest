/**
 * `crowsnest check` with no backend: the package versions a pull request adds to package-lock.json, vetted with the
 * quick check. Other lockfiles are not read here, and the report says so rather than reading as all clear.
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { ChangeReport, ChangeResult } from '../api.js';
import { isExactVersion } from '../commands/install.js';
import { Fetcher, PackageVersion, keyOf, malwareFor } from './osv.js';
import { Packument, fetchPackument } from './registry.js';
import { quickVeto } from './verdict.js';

/** Lockfiles of other ecosystems and package managers, which need the full check. */
const OTHER_LOCKFILES = [
  'pnpm-lock.yaml', 'yarn.lock', 'poetry.lock', 'uv.lock', 'Pipfile.lock', 'Cargo.lock', 'go.sum',
  'composer.lock', 'Gemfile.lock',
];

const CONCURRENCY = 4;
const REF = /^[A-Za-z0-9._/@^~{}-]+$/;

interface LockEntry {
  version?: string;
  name?: string;
  link?: boolean;
  dependencies?: Record<string, LockEntry>;
}

/** Every registry package version in a package-lock.json (lockfile versions 1, 2 and 3). */
export function parsePackageLock(text: string): PackageVersion[] {
  const doc = JSON.parse(text) as { packages?: Record<string, LockEntry>; dependencies?: Record<string, LockEntry> };
  const found = new Map<string, PackageVersion>();
  const add = (name: string | undefined, version: string | undefined): void => {
    if (name && version && isExactVersion(version)) found.set(`${name}@${version}`, { name, version });
  };

  if (doc.packages) {
    for (const [location, entry] of Object.entries(doc.packages)) {
      const marker = location.lastIndexOf('node_modules/');
      // The root and workspace folders are the project itself, and a link points at a folder on disk.
      if (marker < 0 || entry.link) continue;
      add(entry.name ?? location.slice(marker + 'node_modules/'.length), entry.version);
    }
  } else {
    const walk = (deps: Record<string, LockEntry> | undefined): void => {
      for (const [name, entry] of Object.entries(deps ?? {})) {
        add(name, entry.version);
        walk(entry.dependencies);
      }
    };
    walk(doc.dependencies);
  }
  return [...found.values()];
}

export type BaseReader = (projectPath: string, ref: string) => Promise<string | null>;

/** package-lock.json as it was at `ref`; null when that commit had none. Anything else going wrong throws. */
export const readBaseLockfile: BaseReader = (projectPath, ref) =>
  new Promise((resolve, reject) => {
    if (ref.startsWith('-') || !REF.test(ref)) {
      reject(new Error(`"${ref}" is not a usable git ref.`));
      return;
    }
    execFile(
      'git',
      ['-C', projectPath, 'show', `${ref}:./package-lock.json`],
      { maxBuffer: 256 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        if (!error) return resolve(String(stdout));
        if (/exists on disk, but not in|does not exist in/i.test(String(stderr))) return resolve(null);
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return reject(new Error('git is not installed, so the base version of the lockfile cannot be read.'));
        }
        reject(new Error(`git could not read package-lock.json at ${ref}: ${String(stderr).trim() || error.message}`));
      },
    );
  });

export interface QuickChangeOptions {
  base?: string;
  minReleaseAgeDays?: number;
  fetcher?: Fetcher;
  readBase?: BaseReader;
  now?: () => Date;
}

export async function quickChanges(projectPath: string, options: QuickChangeOptions = {}): Promise<ChangeReport> {
  const folder = path.resolve(projectPath);
  const degraded: string[] = [];
  const lockPath = path.join(folder, 'package-lock.json');
  for (const name of OTHER_LOCKFILES) {
    if (fs.existsSync(path.join(folder, name))) {
      degraded.push(`${name} was not read: the quick check reads package-lock.json only. Use \`crowsnest start\`, or the GitHub Action.`);
    }
  }
  if (!fs.existsSync(lockPath)) {
    degraded.push('there is no package-lock.json in this folder, so nothing was checked');
    return report(options.base, folder, [], 0, degraded);
  }

  const current = parsePackageLock(fs.readFileSync(lockPath, 'utf8'));
  let before: PackageVersion[] = [];
  if (options.base) {
    const text = await (options.readBase ?? readBaseLockfile)(folder, options.base);
    before = text ? parsePackageLock(text) : [];
  }
  const known = new Set(before.map(keyOf));
  const changed = current.filter((item) => !known.has(keyOf(item)));
  const earlier = new Map<string, string[]>();
  for (const item of before) earlier.set(item.name, [...(earlier.get(item.name) ?? []), item.version]);

  let malware = new Map<string, string[]>();
  try {
    malware = await malwareFor(changed, options.fetcher);
  } catch (error) {
    degraded.push(`the malware list could not be read: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!options.base) {
    degraded.push('no --base was given, so only the malware list was checked; release changes need --base <ref>');
  }

  const registry = new Map<string, Promise<Packument | null>>();
  const packumentOf = (name: string): Promise<Packument | null> => {
    if (!registry.has(name)) registry.set(name, fetchPackument(name, options.fetcher));
    return registry.get(name) as Promise<Packument | null>;
  };

  const results: ChangeResult[] = new Array(changed.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < changed.length) {
      const index = next++;
      const item = changed[index] as PackageVersion;
      let packument: Packument | null | undefined;
      if (options.base) {
        try {
          packument = await packumentOf(item.name);
        } catch {
          packument = undefined; // quickVeto reads it again and records the failure as not checked
        }
      }
      const verdict = await quickVeto(item.name, item.version, {
        minReleaseAgeDays: options.minReleaseAgeDays,
        fetcher: options.fetcher,
        now: options.now,
        malware,
        skipRegistry: !options.base,
        ...(packument !== undefined ? { packument } : {}),
      });
      const previous = earlier.get(item.name) ?? [];
      results[index] = { ...verdict, change: previous.length ? 'updated' : 'added', previous_versions: previous };
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, changed.length) }, worker));

  for (const r of results) {
    for (const note of r.degraded) degraded.push(`${r.package}@${r.version}: ${note}`);
  }
  return report(options.base, folder, results, current.length - changed.length, degraded);
}

function report(base: string | undefined, folder: string, results: ChangeResult[], unchanged: number, degraded: string[]): ChangeReport {
  return {
    base_ref: base ?? null,
    project_path: folder,
    checked: results.length,
    unchanged,
    blocked: results.filter((r) => r.blocked),
    degraded: [...new Set(degraded)],
    results,
  };
}
