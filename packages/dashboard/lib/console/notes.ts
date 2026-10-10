/**
 * Nib's note under each page title (02-copy 9.2). One line, hand face, UI
 * never mixes it with the plain sentence. Every line here is copied from the
 * copy deck; nothing is composed at runtime.
 *
 * `HOLD_SAFE` is the whitelist (02-copy 0.2): the only Nib lines allowed on a
 * page where a Hold is showing. A test pins that every note returned for a Hold
 * state is in it.
 */
export const HOLD_SAFE = [
  'Start with the first one.',
  'The held ones are first.',
  "Here's who publishes what you use.",
  "Newest first.",
] as const;

export type HorizonNoteState = { loaded: boolean; scanned: boolean; hold: number; watch: number };

/** Horizon. No note while loading, on failure, or before the first scan (the strip speaks). */
export function horizonNote(s: HorizonNoteState): string | null {
  if (!s.loaded || !s.scanned) return null;
  if (s.hold > 0) return 'Start with the first one.';
  if (s.watch > 0) return 'Have a look at the first one.';
  return 'Nothing to hold, as far as I can see.';
}

export const LOOKOUT_NOTE = "Here's who publishes what you use.";
export const LOG_NOTE = 'Newest first.';

/** Hold page: the held ones are first when a Hold or Watch call touches an installed package. */
export function holdNote(hasHeld: boolean): string {
  return hasHeld ? 'The held ones are first.' : 'This is everything on board.';
}

/** Pose beside the Horizon status sentence. `null` = no art (loading, failed, never scanned). */
export function horizonPose(s: HorizonNoteState): 'perch' | 'squint' | 'spy' | null {
  if (!s.loaded || !s.scanned) return null;
  if (s.hold > 0) return 'spy';
  if (s.watch > 0) return 'squint';
  return 'perch';
}
