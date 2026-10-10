// "Check a name" sandbox data and scoring (brief section 7, 02-copy section 3).
// The weights are the repo's real install-check signals (packages/core/api.py
// `veto_check`, checked 2026-10-06 and 2026-10-07). Pure functions, no I/O:
// the landing panel computes in the browser and sends no request.

import type { GaugeLevel } from '@/components/system/Gauge';

export type SignalId = 'new' | 'downloads' | 'repo' | 'lookalike';

export interface Signal {
  id: SignalId;
  /** Technical label (kept for tests and docs). */
  label: string;
  /** Plain reason line shown on the landing: no numbers. */
  plain: string;
  points: number;
}

/** The four install-check signals the sandbox shows (plain words, copy section 3). */
export const SIGNALS: readonly Signal[] = [
  { id: 'new', label: 'Registered less than 30 days ago', plain: 'It was registered very recently.', points: 0.4 },
  { id: 'downloads', label: 'Fewer than 1,000 downloads a week', plain: 'Almost nobody downloads it.', points: 0.3 },
  { id: 'repo', label: 'No link to a code repository', plain: 'It has no link to its source code.', points: 0.2 },
  {
    id: 'lookalike',
    label: 'Name is one or two letters away from a package with over 1,000,000 weekly downloads',
    plain: 'Its name is very close to a popular package.',
    points: 0.35,
  },
];

/** Marks on the meter: the VS Code default warning limit and the fixed install-stop limit. */
export const WATCH_AT = 0.5;
export const HOLD_AT = 0.6;

export interface Sample {
  name: string;
  /** Signals that fire for this fictional package. */
  fires: readonly SignalId[];
  happened: string;
  todo: string;
}

/** Exactly three fictional samples (brief 7). Never add others. */
export const SAMPLES: readonly Sample[] = [
  {
    name: 'tidy-dates',
    fires: [],
    happened: 'tidy-dates showed no warning signs.',
    todo: 'Install it as usual.',
  },
  {
    name: 'fast-csv-lite',
    fires: ['downloads', 'repo'],
    happened: 'fast-csv-lite has almost no downloads and no link to its source code.',
    todo: 'Check who wrote it before you install it.',
  },
  {
    name: 'quikrequest',
    fires: ['new', 'downloads', 'lookalike'],
    happened: 'quikrequest is six days old, almost nobody downloads it, and its name is very close to a popular package.',
    todo: 'Do not install it. Check that you typed the name you meant.',
  },
];

export interface Scored {
  /** Sum of the fired signals, rounded to cents (avoids 0.30000000000000004). */
  raw: number;
  /** Capped at 1.00. */
  score: number;
  level: GaugeLevel;
  word: 'Clear' | 'Watch' | 'Hold';
  fired: Signal[];
  notFired: Signal[];
}

const cents = (n: number) => Math.round(n * 100) / 100;

export function levelFor(score: number): { level: GaugeLevel; word: Scored['word'] } {
  if (score >= HOLD_AT) return { level: 'hold', word: 'Hold' };
  if (score >= WATCH_AT) return { level: 'watch', word: 'Watch' };
  return { level: 'clear', word: 'Clear' };
}

export function scoreSample(sample: Sample): Scored {
  const fired = SIGNALS.filter((s) => sample.fires.includes(s.id));
  const notFired = SIGNALS.filter((s) => !sample.fires.includes(s.id));
  const raw = cents(fired.reduce((sum, s) => sum + s.points, 0));
  const score = Math.min(1, raw);
  return { raw, score, ...levelFor(score), fired, notFired };
}

export const fmt = (n: number) => n.toFixed(2);

/** "Total 0.50." or "Total 1.05, capped at 1.00." */
export function totalLine(s: Scored): string {
  return s.raw > 1 ? `Total ${fmt(s.raw)}, capped at ${fmt(s.score)}.` : `Total ${fmt(s.score)}.`;
}
