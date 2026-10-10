// `cn` now lives in lib/format.ts; this re-export keeps old import paths working.
// The pattern helpers (attackPatternLabel, attackPatternIcon, timeAgo,
// severityConfig) are deleted: the emoji icons and rainbow severity colours
// they carried are banned. Use lib/format.ts and lib/sightline/templates.ts.
export { cn } from './format';

export function formatConfidence(n: number): string {
  return n.toFixed(2);
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
