/** Pure helpers for the console keyboard map (03-ia 2.6). */

export const CHORD_WINDOW_MS = 1200;

export const CHORD_TARGETS: Record<string, { href: string; label: string }> = {
  h: { href: '/horizon', label: 'Horizon' },
  l: { href: '/lookout', label: 'Lookout' },
  o: { href: '/hold', label: 'Installed' },
  g: { href: '/log', label: 'Log' },
};

export const SINGLE_KEYS_STORAGE = 'crowsnest.console.shortcuts';

/** True for text fields, selects, contenteditable: single-key shortcuts must stay inert there. */
export function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return el.isContentEditable || el.getAttribute('contenteditable') === 'true';
}

export type KeyDecision =
  | { kind: 'none' }
  | { kind: 'chord-start' }
  | { kind: 'goto'; href: string }
  | { kind: 'help' }
  | { kind: 'filter' }
  | { kind: 'scan' }
  | { kind: 'refresh' }
  | { kind: 'row'; dir: 1 | -1 };

/**
 * Decides what a keydown means. `chordOpen` is true inside the 1200ms window
 * after `g`. Modified keys and typing targets never match.
 */
export function decideKey(
  e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean },
  ctx: { typing: boolean; dialogOpen: boolean; chordOpen: boolean; singleKeys: boolean },
): KeyDecision {
  if (e.ctrlKey || e.metaKey || e.altKey) return { kind: 'none' };
  if (ctx.typing || ctx.dialogOpen) return { kind: 'none' };
  if (!ctx.singleKeys && e.key !== '?') return { kind: 'none' };
  if (ctx.chordOpen) {
    const t = CHORD_TARGETS[e.key.toLowerCase()];
    return t ? { kind: 'goto', href: t.href } : { kind: 'none' };
  }
  switch (e.key) {
    case 'g':
      return { kind: 'chord-start' };
    case '?':
      return { kind: 'help' };
    case '/':
      return { kind: 'filter' };
    case 's':
      return { kind: 'scan' };
    case 'r':
      return { kind: 'refresh' };
    case 'j':
      return { kind: 'row', dir: 1 };
    case 'k':
      return { kind: 'row', dir: -1 };
    default:
      return { kind: 'none' };
  }
}
