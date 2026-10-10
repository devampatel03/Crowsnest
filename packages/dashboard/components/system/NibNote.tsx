import type { ElementType, ReactNode } from 'react';
import { cn } from '@/lib/format';

/**
 * Nib's note (v3): one line of handwriting-face text, placed under or beside a
 * page title. Text only. The mascot art comes from `components/mascot`, which
 * the caller may pass through `pose` (rendered first, `aria-hidden`, so Nib
 * is never the only carrier of meaning).
 *
 * Rules (brief sections 1 and 6): 14 words or fewer, one idea, no exclamation
 * marks, and on anything with a Hold the note says what to do next, plainly,
 * with no wink. Never inside a Call, table cell or button.
 */
export function NibNote({
  children,
  pose,
  size = 'm',
  as,
  className,
}: {
  children: ReactNode;
  pose?: ReactNode;
  size?: 'm' | 's';
  as?: ElementType;
  className?: string;
}) {
  const Tag = (as ?? 'p') as ElementType;
  return (
    <div className={cn('flex items-center gap-s2', className)} data-nib-note>
      {pose ? (
        <span aria-hidden="true" className="shrink-0">
          {pose}
        </span>
      ) : null}
      <Tag className={cn('nib-voice m-0', size === 's' && 'nib-voice-s')}>{children}</Tag>
    </div>
  );
}

/** Alias for the handoff name in the brief ("NoteLine"). */
export const NoteLine = NibNote;
