import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatDistanceToNow } from 'date-fns';
import type { Severity, AttackPattern } from './types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function severityConfig(s: Severity): { label: string; color: string; bg: string; border: string } {
  const map: Record<Severity, { label: string; color: string; bg: string; border: string }> = {
    CRITICAL: { label: 'CRITICAL', color: 'text-red-400', bg: 'bg-red-500/20', border: 'border-red-500' },
    HIGH: { label: 'HIGH', color: 'text-orange-400', bg: 'bg-orange-500/20', border: 'border-orange-500' },
    MEDIUM: { label: 'MEDIUM', color: 'text-amber-400', bg: 'bg-amber-500/20', border: 'border-amber-500' },
    LOW: { label: 'LOW', color: 'text-cyan-400', bg: 'bg-cyan-500/20', border: 'border-cyan-500' },
  };
  return map[s] || map.LOW;
}

export function attackPatternLabel(p: AttackPattern): string {
  const labels: Record<AttackPattern, string> = {
    maintainer_takeover: 'Maintainer Takeover',
    worm: 'Token-Theft Worm',
    slopsquat: 'Slopsquatting',
    slsa_poisoning: 'SLSA Poisoning',
    sleeper: 'Sleeper Dependency',
    identity_drift: 'Identity Drift',
    typosquat: 'Typosquatting',
    dep_confusion: 'Dep Confusion',
    ioc_match: 'Active IOC Match',
    ci_cache_poisoning: 'CI Cache Poisoning',
    oidc_misuse: 'OIDC Token Misuse',
    abandoned_popular: 'Abandoned Package',
  };
  return labels[p] || p;
}

export function attackPatternIcon(p: AttackPattern): string {
  const icons: Record<AttackPattern, string> = {
    maintainer_takeover: '👤',
    worm: '🪱',
    slopsquat: '🤖',
    slsa_poisoning: '🔏',
    sleeper: '😴',
    identity_drift: '🎭',
    typosquat: '🎪',
    dep_confusion: '🔀',
    ioc_match: '🚨',
    ci_cache_poisoning: '☠️',
    oidc_misuse: '🔑',
    abandoned_popular: '🏚️',
  };
  return icons[p] || '⚠️';
}

export function formatConfidence(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export function timeAgo(ts: string): string {
  try {
    return formatDistanceToNow(new Date(ts), { addSuffix: true });
  } catch {
    return ts;
  }
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
