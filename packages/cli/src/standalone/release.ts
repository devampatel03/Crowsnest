/**
 * Does a release look hijacked? The same question the backend asks (RELEASE_ANOMALY in
 * packages/core/queries/templates.py), answered from the registry's own document, so the weights and the threshold
 * below must stay the same as there. A release is compared with the version just below it on its own major line
 * (pre-releases only with pre-releases), so a backport is a change from its own line, not from the newest release.
 */

import type { Fetcher } from './osv.js';
import { Packument, VersionDoc, declaredRepo, fetchProvenanceRepo, repoSlug } from './registry.js';

export const ANOMALY_THRESHOLD = 3;

const WEIGHTS = {
  provenance_repo_changed: 3,
  repo_mismatch_declared: 2,
  provenance_dropped: 2,
  install_hook_added: 2,
  new_publisher: 2,
  dependency_added: 1,
  size_jump: 1,
  dormant_release: 1,
} as const;

export type Signal = keyof typeof WEIGHTS;

const DAY_MS = 86_400_000;
const INSTALL_HOOKS = ['preinstall', 'install', 'postinstall'];

export interface Assessment {
  score: number;
  signals: Signal[];
  publishedAt: Date | null;
  /** The version it was compared with, or null when there is none to compare with (a first release). */
  previous: string | null;
}

interface Parsed {
  version: string;
  major: number;
  numbers: [number, number, number];
  prerelease: boolean;
  published: number;
}

function parse(version: string, time: Record<string, string>): Parsed | null {
  const stamp = Date.parse(time[version] ?? '');
  if (Number.isNaN(stamp)) return null;
  const match = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(version);
  const numbers: [number, number, number] = [Number(match?.[1] ?? 0), Number(match?.[2] ?? 0), Number(match?.[3] ?? 0)];
  return { version, major: numbers[0], numbers, prerelease: /[A-Za-z-]/.test(version.replace(/^v/, '')), published: stamp };
}

function compare(a: Parsed, b: Parsed): number {
  return a.numbers[0] - b.numbers[0] || a.numbers[1] - b.numbers[1] || a.numbers[2] - b.numbers[2] ||
    a.published - b.published || (a.version < b.version ? -1 : a.version > b.version ? 1 : 0);
}

/** The version a release is compared with, or null. */
export function previousVersion(packument: Packument, version: string): string | null {
  const current = parse(version, packument.time);
  if (!current) return null;
  const line = Object.keys(packument.versions)
    .map((v) => parse(v, packument.time))
    .filter((p): p is Parsed => p !== null && p.major === current.major && p.prerelease === current.prerelease)
    .sort(compare);
  const index = line.findIndex((p) => p.version === version);
  return index > 0 ? (line[index - 1]?.version ?? null) : null;
}

const hooks = (doc: VersionDoc): boolean => INSTALL_HOOKS.some((name) => doc.scripts?.[name]);
const hasProvenance = (doc: VersionDoc): boolean => Boolean(doc.dist?.attestations);
const dependencyNames = (doc: VersionDoc): string[] => Object.keys(doc.dependencies ?? {});

/** The signals for one release. `repos` are the repositories the signed build records name, where they could be read. */
export function scoreRelease(
  packument: Packument,
  version: string,
  repos: { current?: string | null; previous?: string | null } = {},
): Assessment {
  const doc = packument.versions[version];
  const current = parse(version, packument.time);
  if (!doc || !current) return { score: 0, signals: [], publishedAt: null, previous: null };

  const previous = previousVersion(packument, version);
  const before = previous ? packument.versions[previous] : undefined;
  const beforeParsed = previous ? parse(previous, packument.time) : null;
  const flags: Record<Signal, boolean> = {
    provenance_repo_changed: false,
    repo_mismatch_declared: false,
    provenance_dropped: false,
    install_hook_added: false,
    new_publisher: false,
    dependency_added: false,
    size_jump: false,
    dormant_release: false,
  };

  const publisher = doc._npmUser?.name ?? '';
  if (beforeParsed && publisher) {
    flags.new_publisher = !Object.keys(packument.versions).some((other) => {
      const when = Date.parse(packument.time[other] ?? '');
      return other !== version && packument.versions[other]?._npmUser?.name === publisher && when < current.published;
    });
  }
  if (before) {
    const earlier = new Set(dependencyNames(before));
    flags.dependency_added = dependencyNames(doc).some((name) => !earlier.has(name));
    flags.install_hook_added = hooks(doc) && !hooks(before);
    flags.provenance_dropped = hasProvenance(before) && !hasProvenance(doc);
    const was = before.dist?.unpackedSize ?? 0;
    const now = doc.dist?.unpackedSize ?? 0;
    flags.size_jump = was > 0 && now >= 2 * was && now - was >= 20_000;
  }
  if (beforeParsed) flags.dormant_release = current.published - beforeParsed.published > 365 * DAY_MS;

  const now = repoSlug(repos.current);
  const was = repoSlug(repos.previous);
  flags.provenance_repo_changed = now !== '' && was !== '' && now !== was;
  const declared = repoSlug(declaredRepo(packument));
  flags.repo_mismatch_declared = now !== '' && declared !== '' && now !== declared;

  const signals = (Object.keys(WEIGHTS) as Signal[]).filter((name) => flags[name]);
  return {
    score: signals.reduce((sum, name) => sum + WEIGHTS[name], 0),
    signals,
    publishedAt: new Date(current.published),
    previous,
  };
}

/** `scoreRelease`, reading the build records of this release and the one before it when they carry provenance. */
export async function assessRelease(packument: Packument, version: string, fetcher: Fetcher = fetch): Promise<Assessment> {
  const previous = previousVersion(packument, version);
  const urlOf = (v: string | null): string | undefined => (v ? packument.versions[v]?.dist?.attestations?.url : undefined);
  const [current, before] = await Promise.all([
    urlOf(version) ? fetchProvenanceRepo(urlOf(version) as string, fetcher) : Promise.resolve(null),
    urlOf(previous) ? fetchProvenanceRepo(urlOf(previous) as string, fetcher) : Promise.resolve(null),
  ]);
  return scoreRelease(packument, version, { current, previous: before });
}
