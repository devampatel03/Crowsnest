import type { ReactNode } from 'react';
import { cn } from '@/lib/format';

/**
 * Glyph plus `Crowsnest.` in Instrument Serif 24px. Wrap in a link at the
 * call site. `glyph` is the slot for the NibMini mascot mark (decorative, 20px); without it a two-line
 * bearing-tick glyph renders.
 */
export function Wordmark({ glyphOnly, glyph, className }: { glyphOnly?: boolean; glyph?: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-s2 text-fg', className)}>
      {glyph ? (
        <span aria-hidden="true" data-wordmark-glyph className="inline-flex shrink-0">
          {glyph}
        </span>
      ) : (
        <svg width="16" height="16" viewBox="0 0 14 14" aria-hidden="true" className="shrink-0 stroke-brand" fill="none">
          <path d="M1 1V13" strokeWidth="1" />
          <path d="M1 3H13" strokeWidth="1.5" />
          <path d="M1 9H6" strokeWidth="1" />
        </svg>
      )}
      {glyphOnly ? (
        <span className="sr-only">Crowsnest</span>
      ) : (
        <span className="font-display text-[1.5rem] leading-none tracking-h3">Crowsnest.</span>
      )}
    </span>
  );
}
