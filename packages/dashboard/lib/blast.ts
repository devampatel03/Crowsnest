import { affectedProjects, type AffectedProject } from '@/lib/calls';
import type { BlastRadiusResult, MaintainerScore } from '@/lib/types';

export type WhoElse =
  | { kind: 'projects'; projects: AffectedProject[] }
  | { kind: 'none'; text: string };

/**
 * The "Who else is affected" view for a selected person. Never states a
 * contradiction: "no projects depend on them" only when Crowsnest also sees
 * no packages of theirs in your graph; otherwise the honest "couldn't find".
 */
export function whoElse(result: BlastRadiusResult | undefined, m: Pick<MaintainerScore, 'login' | 'packages_in_graph'>): WhoElse {
  const projects = affectedProjects(result?.blast_radius_entries ?? []);
  if (projects.length > 0) return { kind: 'projects', projects };
  return {
    kind: 'none',
    text:
      m.packages_in_graph === 0
        ? `No projects of yours depend on packages from ${m.login}.`
        : `Crowsnest knows ${m.login} publishes ${m.packages_in_graph.toLocaleString('en-US')} ${m.packages_in_graph === 1 ? 'package' : 'packages'} you use, but could not list the projects.`,
  };
}

/** `4 years`, `7 months`, `New this month`; 0 means the backend has no date, so say so. */
export function platformAge(days: number): string {
  if (days <= 0) return 'Unknown';
  if (days < 30) return 'New this month';
  if (days < 365) {
    const m = Math.floor(days / 30);
    return m === 1 ? '1 month' : `${m} months`;
  }
  const y = Math.floor(days / 365);
  return y === 1 ? '1 year' : `${y} years`;
}

/**
 * `Active: 42 commits in the last 90 days`, or `Active: Unknown`. The backend sends 0 both
 * for "no activity" and "no data"; with no repositories seen either, 0 means unknown.
 */
export function activityText(m: Pick<MaintainerScore, 'commits_90d' | 'repos_touched'>): string {
  if (m.commits_90d <= 0 && m.repos_touched <= 0) return 'Active: Unknown';
  return `Active: ${m.commits_90d.toLocaleString('en-US')} ${m.commits_90d === 1 ? 'commit' : 'commits'} in the last 90 days`;
}
