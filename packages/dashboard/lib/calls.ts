import { gaugeFromSeverity, type GaugeLevel } from '@/components/system/Gauge';
import type { BlastRadiusEntry, Incident } from '@/lib/types';

/**
 * Plain-language mapping from an Incident to the Call card. No attack-pattern code, template name, confidence decimal or
 * raw finding ever leaves this file.
 */

export const GENERIC_HEADLINE = 'Crowsnest found something unusual about this package.';
export const GENERIC_ADVICE = 'Check this package before you rely on it.';

const HEADLINES: Record<string, string> = {
  maintainer_takeover: 'The person who maintains this package changed recently.',
  worm: 'One account published many packages in a few minutes.',
  slopsquat: 'A new package looks like a name an AI assistant made up.',
  slsa_poisoning: "This package's build process may have been tampered with.",
  sleeper: 'A quiet package just added a script that runs when you install it.',
  identity_drift: 'The way this maintainer works changed suddenly.',
  typosquat: "This package's name is very close to a famous one.",
  dep_confusion: 'A public package has the same name as something that looks private to you.',
  ioc_match: 'This package is on a list of known harmful packages.',
  ci_cache_poisoning: 'A package build reuses saved files, and those files could have been tampered with.',
  oidc_misuse: 'A build job got a sign-in pass it should not have had.',
  abandoned_popular: 'Many people use this package, but it has not been updated in over a year.',
  release_anomaly: 'A new release of this package changed in ways that look like a hijacked account or build.',
};

/** The only 'What to do' text end users see by default. Backend prose never replaces it. */
const FALLBACK_ADVICE: Record<string, string> = {
  maintainer_takeover: 'Stay on the last version from before the change, and look at what the new maintainer changed.',
  worm: 'Remove the package now. Replace any keys or tokens it could have reached.',
  slopsquat: 'Check that you meant to add this package. If not, remove it.',
  slsa_poisoning: 'Use a version from a build you trust, and tell the maintainer.',
  sleeper: 'Go back to the previous version, or remove it, and read what the new script does.',
  identity_drift: 'Contact the maintainer another way to confirm it is them. Stay on the older version for now.',
  typosquat: 'Check the name you meant to type. Remove this one and install the right one.',
  dep_confusion: 'Check where this package is installed from. It should come from your private registry.',
  ioc_match: 'Remove it now. Replace any keys or tokens in the places it ran.',
  ci_cache_poisoning: 'Clear your build caches and look for files that changed.',
  oidc_misuse: 'Limit that sign-in pass to your main branch. Replace credentials it could have reached.',
  abandoned_popular: 'Look for a maintained alternative before you rely on it further.',
  release_anomaly: 'Stay on the previous version until the changes are explained. If it already ran, replace the keys it could reach.',
};

export function headlineFor(pattern: string): string {
  return HEADLINES[pattern] ?? GENERIC_HEADLINE;
}

/** Display label only. Thresholds are a display choice; the number is never shown. */
export function howSure(confidence: number): 'Very sure' | 'Fairly sure' | 'Worth a look' {
  if (confidence >= 0.85) return 'Very sure';
  if (confidence >= 0.5) return 'Fairly sure';
  return 'Worth a look';
}

/** The project folder as a stable comparison key (Windows drive letters differ in case). */
export function projectKey(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

/** Folder name only: a project is shown by its folder, never by a full path on someone's disk. */
export function projectName(path: string): string {
  const seg = path.split(/[\\/]/).filter(Boolean);
  return seg[seg.length - 1] ?? path;
}

export type AffectedProject = { path: string; items: { package: string; version: string }[] };

/** Groups blast-radius rows by project, de-duplicating the same package@version. */
export function affectedProjects(entries: readonly BlastRadiusEntry[]): AffectedProject[] {
  const byProject = new Map<string, AffectedProject & { seen: Set<string> }>();
  for (const e of entries) {
    if (!e.project_path) continue;
    const k = projectKey(e.project_path);
    let p = byProject.get(k);
    if (!p) {
      p = { path: e.project_path, items: [], seen: new Set() };
      byProject.set(k, p);
    }
    const id = `${e.package}@${e.version}`;
    if (p.seen.has(id)) continue;
    p.seen.add(id);
    p.items.push({ package: e.package, version: e.version });
  }
  return [...byProject.values()].map(({ path, items }) => ({ path, items }));
}

/** Names of the packages an incident is about: `packages` plus any `packages_list` in the findings. */
export function incidentPackages(i: Pick<Incident, 'packages' | 'raw_findings'>): string[] {
  const out = new Set(i.packages);
  for (const f of i.raw_findings) {
    const l = f.packages_list;
    if (Array.isArray(l)) for (const p of l) if (typeof p === 'string' && p) out.add(p);
  }
  return [...out];
}

function maintainerLogin(i: Pick<Incident, 'raw_findings'>): string | null {
  for (const f of i.raw_findings) {
    for (const k of ['login', 'maintainer', 'maintainer_login', 'published_by']) {
      const v = f[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
  }
  return null;
}

export type Call = {
  id: string;
  level: GaugeLevel;
  urgent: boolean;
  headline: string;
  /** `name@version`, or `name +2 more`; a maintainer's packages when the incident names none. */
  subject: string;
  /** `Used in 3 projects` or the honest "couldn't find" line. */
  usedIn: string;
  projectCount: number | null;
  /** The fixed plain-language action (one sentence). */
  advice: string[];
  /** Raw suggestions from the backend or model. Shown only behind `More detail`. */
  moreDetail: string[];
  howSure: string;
  who: AffectedProject[];
  detectedAt: string;
};

/** First package with its version when the blast radius records one. */
function subjectOf(i: Incident): string {
  // When the blast radius lists the packages of yours that are affected, count those, so the
  // card and the "Who else is affected" list agree.
  const affected = [...new Set(i.blast_radius.map((e) => e.package).filter(Boolean))];
  const names = affected.length > 0 ? affected : i.packages;
  if (names.length === 0) {
    const login = maintainerLogin(i);
    return login ? `${login}'s packages` : 'a package';
  }
  const first = (affected.length > 0 ? i.packages.find((p) => affected.includes(p)) : undefined) ?? names[0];
  const hit = i.blast_radius.find((e) => e.package === first && e.version);
  const label = hit ? `${first}@${hit.version}` : first;
  return names.length > 1 ? `${label} +${names.length - 1} more` : label;
}

export function callFor(i: Incident): Call {
  const { level, urgent } = gaugeFromSeverity(i.severity);
  const who = affectedProjects(i.blast_radius);
  // An empty blast radius does not prove "no projects use this": the backend may simply not have found any.
  const projectCount = who.length > 0 ? who.length : null;
  return {
    id: i.id,
    level,
    urgent,
    headline: headlineFor(i.attack_pattern),
    subject: subjectOf(i),
    usedIn:
      projectCount === null
        ? "Crowsnest couldn't find which projects use this."
        : projectCount === 1
          ? 'Used in 1 project'
          : `Used in ${projectCount} projects`,
    projectCount,
    advice: [FALLBACK_ADVICE[i.attack_pattern] ?? GENERIC_ADVICE],
    moreDetail: i.remediation_options,
    howSure: howSure(i.confidence),
    who,
    detectedAt: i.detected_at,
  };
}

/** Worst first (urgent, then Hold, Watch, Note), newest first within a level. */
const RANK: Record<Incident['severity'], number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
export function compareCalls(a: Incident, b: Incident): number {
  const r = RANK[a.severity] - RANK[b.severity];
  return r !== 0 ? r : (Date.parse(b.detected_at) || 0) - (Date.parse(a.detected_at) || 0);
}

export type Bucket = 'hold' | 'watch' | 'note';
export function bucketOf(s: Incident['severity']): Bucket {
  return s === 'CRITICAL' || s === 'HIGH' ? 'hold' : s === 'MEDIUM' ? 'watch' : 'note';
}

export function countBuckets(list: readonly Pick<Incident, 'severity'>[]): Record<Bucket, number> {
  const c: Record<Bucket, number> = { hold: 0, watch: 0, note: 0 };
  for (const i of list) c[bucketOf(i.severity)]++;
  return c;
}

/** Status sentence: 0 / 1 / n. */
/** Status sentence. It counts calls (de-duplicated), which is what the Hold and Watch numerals count. */
export function statusSentence(n: number): string {
  if (n === 0) return 'Nothing needs your attention.';
  return n === 1 ? '1 call needs your attention.' : `${n.toLocaleString('en-US')} calls need your attention.`;
}
