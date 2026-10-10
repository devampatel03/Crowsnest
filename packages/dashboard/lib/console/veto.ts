import type { VetoResult } from '@/lib/types';

/** Installs stop at this risk (api.py `veto_check`). */
export const VETO_THRESHOLD = 0.6;

const n = (s: string): string => s.replace(/[^\d,]/g, '');

/**
 * One backend signal string to one plain sentence (02-copy 9.5). Anything not
 * recognised becomes a generic line: raw backend text is never printed.
 */
export function plainSignal(signal: string): string {
  let m = /registered (\d+) days? ago/i.exec(signal);
  if (m) return `Registered ${m[1]} days ago.`;
  m = /only ([\d,]+) weekly downloads/i.exec(signal);
  if (m) return `Only ${n(m[1])} downloads a week.`;
  if (/no github repository/i.test(signal)) return 'No link to a code repository.';
  if (/not found in crowsnest database/i.test(signal)) return 'Crowsnest has no record of this package. It may be new.';
  if (/hallucination/i.test(signal)) return 'AI assistants are known to invent this name.';
  if (/active ioc/i.test(signal)) return 'This package is on a list of known harmful packages.';
  if (/socket/i.test(signal)) return 'Socket has raised an alert about this package.';
  m = /similar to '([^']+)'\s*\(([\d,]+) downloads\)/i.exec(signal);
  if (m) return `Its name is very close to ${m[1]}, which has ${n(m[2])} downloads a week.`;
  return 'Crowsnest noticed something unusual about this package.';
}

export type PlainVeto = { level: 'ok' | 'warn' | 'unknown' | 'hold'; headline: string; note?: string; reasons: string[] };

const NO_RECORD = /not found in crowsnest database/i;

/**
 * Plain result of the install check. No decimals. A package Crowsnest has no
 * record of is "Unknown", never "OK": the backend lets it through with a
 * warning, and the sentence says so plainly.
 */
export function plainVeto(r: VetoResult): PlainVeto {
  const unknown = r.signals.some((s) => NO_RECORD.test(s));
  const reasons = r.signals.filter((s) => !(unknown && NO_RECORD.test(s))).map(plainSignal);
  if (r.blocked) return { level: 'hold', headline: 'Hold. Crowsnest would stop this install.', reasons };
  if (unknown) {
    return {
      level: 'unknown',
      headline: 'Unknown. Crowsnest has no record of this package, so it cannot call it clear.',
      note: 'An unknown package is allowed with a warning. Installs stop only for packages that look clearly risky.',
      reasons,
    };
  }
  if (reasons.length > 0) return { level: 'warn', headline: 'OK to install, with a warning.', reasons };
  return { level: 'ok', headline: 'OK to install. Nothing unusual found.', reasons };
}
