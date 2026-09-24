import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatDistanceToNow } from 'date-fns';
import type { Severity, AttackPattern } from './types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function severityConfig(s: Severity): { label: string; color: string; bg: string; border: string } {
  const map: Record<Severity, { label: string; color: string; bg: string; border: string }> = {
    CRITICAL: { label: 'CRITICAL', color: 'text-severity-critical', bg: 'bg-severity-critical-bg', border: 'border-severity-critical-border' },
    HIGH: { label: 'HIGH', color: 'text-severity-high', bg: 'bg-severity-high-bg', border: 'border-severity-high-border' },
    MEDIUM: { label: 'MEDIUM', color: 'text-severity-medium', bg: 'bg-severity-medium-bg', border: 'border-severity-medium-border' },
    LOW: { label: 'LOW', color: 'text-severity-low', bg: 'bg-severity-low-bg', border: 'border-severity-low-border' },
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
