/**
 * Full check (the Crowsnest backend answers) or quick check (it does not, and the built-in lookups are used).
 */

import { api } from '../api.js';
import { StartError } from '../commands/backend.js';

export type Mode = 'full' | 'quick';

export interface ModeFlags {
  quick?: boolean;
  full?: boolean;
}

export const QUICK_NOTE =
  'Quick check: the public malware list, what changed since the previous release, and release age. ' +
  '`crowsnest start` adds typosquat, invented-name and registry-history checks.';

/**
 * Said when `crowsnest install` finds Crowsnest not running. Install never drops to a weaker check by itself: a package
 * that passes a quick check can still be one the full check would stop, so the person is told to start Crowsnest.
 */
export const NOT_RUNNING_FOR_INSTALL =
  'Crowsnest is not running, so there is nothing to check this package against. Nothing was installed.\n\n' +
  '  1. Start it:   crowsnest start\n' +
  '  2. Run this command again.\n\n' +
  'To install with only the public malware list and release age checked, add --quick.';

/**
 * The mode for `crowsnest install`. Crowsnest must answer, unless `--quick` was given on purpose. Asks every time, so
 * a Crowsnest that has stopped since the last install is noticed before anything is installed.
 */
export async function chooseInstallMode(
  flags: ModeFlags,
  backendAnswers: () => Promise<boolean> = () =>
    api.health().then(() => true, () => false),
): Promise<Mode> {
  if (flags.quick && flags.full) throw new StartError('Choose --quick or --full, not both.');
  if (flags.quick) return 'quick';
  if (await backendAnswers()) return 'full';
  throw new StartError(NOT_RUNNING_FOR_INSTALL);
}

export async function chooseMode(
  flags: ModeFlags,
  backendAnswers: () => Promise<boolean> = () =>
    api.health().then(() => true, () => false),
): Promise<Mode> {
  if (flags.quick && flags.full) throw new StartError('Choose --quick or --full, not both.');
  if (flags.quick) return 'quick';
  const answers = await backendAnswers();
  if (flags.full && !answers) {
    throw new StartError('--full needs Crowsnest running, and nothing answered. Start it with: crowsnest start');
  }
  return answers ? 'full' : 'quick';
}
