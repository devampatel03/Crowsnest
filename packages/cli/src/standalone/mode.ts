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
