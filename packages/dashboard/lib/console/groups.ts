import { compareCalls, incidentPackages } from '@/lib/calls';
import type { Incident } from '@/lib/types';

/**
 * Grouped Calls on Horizon ("Also found 2 more times").
 *
 * The rule is deliberately strict. Two incidents join one group ONLY when all
 * three are identical:
 *   1. the kind of call (attack pattern),
 *   2. the set of packages (names, order ignored, from `packages` and any
 *      `packages_list` in the findings), and
 *   3. the set of people (every login named in the findings, order ignored).
 * Severity must match as well, so a Hold is never folded under a Watch.
 *
 * Anything that differs in any one of those stays its own card. The Log never
 * groups: it lists every individual call.
 */

const LOGIN_KEYS = ['login', 'maintainer', 'maintainer_login', 'published_by'] as const;

/** Every person named in the findings, lower-cased and sorted. */
export function incidentPeople(i: Pick<Incident, 'raw_findings'>): string[] {
  const out = new Set<string>();
  for (const f of i.raw_findings) {
    for (const k of LOGIN_KEYS) {
      const v = f[k];
      if (typeof v === 'string' && v.trim()) out.add(v.trim().toLowerCase());
    }
  }
  return [...out].sort();
}

/** The identity of a call for grouping: pattern, severity, package set, people set. */
export function groupKey(i: Incident): string {
  const pkgs = incidentPackages(i)
    .map((p) => p.toLowerCase())
    .sort();
  return JSON.stringify([i.attack_pattern, i.severity, pkgs, incidentPeople(i)]);
}

export type CallGroup = {
  /** The newest incident of the group; the card shows this one. */
  lead: Incident;
  /** The other incidents with the identical key, newest first. */
  others: Incident[];
};

/** Groups a worst-first list. Group order follows the first (worst, newest) member. */
export function groupCalls(list: readonly Incident[]): CallGroup[] {
  const sorted = [...list].sort(compareCalls);
  const byKey = new Map<string, CallGroup>();
  for (const i of sorted) {
    const k = groupKey(i);
    const g = byKey.get(k);
    if (g) g.others.push(i);
    else byKey.set(k, { lead: i, others: [] });
  }
  return [...byKey.values()];
}

/** "Also found 2 more times." / "Also found 1 more time." */
export function alsoFound(n: number): string {
  return `Also found ${n.toLocaleString('en-US')} more ${n === 1 ? 'time' : 'times'}.`;
}
