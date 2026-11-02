/**
 * A quick check of one npm version with no Crowsnest backend: the public malware list, what changed since the
 * previous release, and how long the version has been public. It returns the same shape the backend's veto does, so
 * the install and check screens do not care which one answered.
 *
 * What it does not do, because those need the backend's stored data: typosquat and invented-name matching, registry
 * history, and known-campaign lists by name.
 */

import type { VetoResult } from '../api.js';
import { Fetcher, malwareFor, keyOf } from './osv.js';
import { Packument, fetchPackument } from './registry.js';
import { ANOMALY_THRESHOLD, assessRelease } from './release.js';

export const DEFAULT_MIN_RELEASE_AGE_DAYS = 2;
const BLOCK_THRESHOLD = 0.6;

export interface QuickOptions {
  /** Days a version must have been public. 0 turns the rule off. */
  minReleaseAgeDays?: number;
  fetcher?: Fetcher;
  now?: () => Date;
  /** Malware answers already fetched for a batch of packages, so a pull request asks the list once. */
  malware?: Map<string, string[]>;
  /** A registry document already fetched. */
  packument?: Packument | null;
  /** Check only the malware list. Used when there is no earlier release to compare with. */
  skipRegistry?: boolean;
}

export function describeAge(hours: number): string {
  return hours < 48 ? `${hours.toFixed(0)} hours` : `${(hours / 24).toFixed(0)} days`;
}

const failure = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export async function quickVeto(name: string, version: string | undefined, options: QuickOptions = {}): Promise<VetoResult> {
  const fetcher = options.fetcher ?? fetch;
  const now = (options.now ?? (() => new Date()))();
  const minAgeDays = options.minReleaseAgeDays ?? DEFAULT_MIN_RELEASE_AGE_DAYS;
  const signals: string[] = [];
  const degraded: string[] = [];
  let probability = 0;
  let hardBlock = false;
  let tooNew = false;
  let ageHours: number | null = null;

  if (!version) {
    degraded.push('the exact version could not be worked out, so nothing could be checked');
    return result(name, version, false, 0, signals, degraded, ageHours);
  }

  try {
    const known = (options.malware ?? (await malwareFor([{ name, version }], fetcher))).get(keyOf({ name, version }));
    if (known?.length) {
      probability = 1;
      hardBlock = true;
      signals.push(`ACTIVE IOC: ${name}@${version} is listed as malicious (${known.join(', ')})`);
    }
  } catch (error) {
    degraded.push(`the malware list could not be read: ${failure(error)}`);
  }

  let packument: Packument | null | undefined = options.skipRegistry ? undefined : options.packument;
  if (packument === undefined && !options.skipRegistry) {
    try {
      packument = await fetchPackument(name, fetcher);
    } catch (error) {
      packument = undefined;
      degraded.push(`the npm registry could not be read: ${failure(error)}`);
    }
  }
  if (packument === null) {
    degraded.push('the npm registry has no package with this name');
  } else if (packument) {
    if (!packument.versions[version]) {
      degraded.push(`the npm registry has no version ${version} of ${name}`);
    } else {
      const assessment = await assessRelease(packument, version, fetcher);
      if (assessment.score >= ANOMALY_THRESHOLD) {
        probability += 0.6;
        signals.push(`Release looks hijacked: ${assessment.signals.join(', ')} compared with the previous version`);
      }
      if (assessment.publishedAt) {
        ageHours = (now.getTime() - assessment.publishedAt.getTime()) / 3_600_000;
        if (minAgeDays > 0 && ageHours < minAgeDays * 24) {
          tooNew = true;
          signals.push(
            `Version ${version} was published ${describeAge(ageHours)} ago; policy is to wait ${describeAge(minAgeDays * 24)}`,
          );
        }
      } else {
        degraded.push('release date unknown: the registry did not report when this version was published');
      }
    }
  }

  probability = Math.min(probability, 1);
  return result(name, version, probability >= BLOCK_THRESHOLD || hardBlock || tooNew, probability, signals, degraded, ageHours);
}

function result(
  name: string,
  version: string | undefined,
  blocked: boolean,
  probability: number,
  signals: string[],
  degraded: string[],
  ageHours: number | null,
): VetoResult {
  return {
    blocked,
    package: name,
    version: version ?? null,
    ecosystem: 'npm',
    probability: Math.round(probability * 100) / 100,
    signals,
    degraded,
    release_age_hours: ageHours === null ? null : Math.round(ageHours * 10) / 10,
    reason: signals[0] ?? 'No specific signals detected',
    override_flag: blocked ? '--crowsnest-acknowledge-risk' : null,
  };
}
