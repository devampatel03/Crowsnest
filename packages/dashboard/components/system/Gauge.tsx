import { cn } from '@/lib/format';
import type { Severity } from '@/lib/types';

/** Gauge levels. `note` is neutral and never means "clear". */
export type GaugeLevel = 'clear' | 'note' | 'watch' | 'hold';

/** Notches filled per level: Clear 0, Note 1, Watch 2, Hold 3. Meaning survives greyscale. */
export const GAUGE_FILLED: Record<GaugeLevel, number> = { clear: 0, note: 1, watch: 2, hold: 3 };

export const GAUGE_WORD: Record<GaugeLevel, string> = { clear: 'Clear', note: 'Note', watch: 'Watch', hold: 'Hold' };

const LEVEL_TEXT: Record<GaugeLevel, string> = {
  clear: 'text-clear',
  note: 'text-fg-mute',
  watch: 'text-watch',
  hold: 'text-hold',
};

/** LOW -> Note; MEDIUM -> Watch; HIGH -> Hold; CRITICAL -> Hold (urgent). */
export function gaugeFromSeverity(s: Severity): { level: GaugeLevel; urgent: boolean } {
  switch (s) {
    case 'CRITICAL':
      return { level: 'hold', urgent: true };
    case 'HIGH':
      return { level: 'hold', urgent: false };
    case 'MEDIUM':
      return { level: 'watch', urgent: false };
    case 'LOW':
    default:
      return { level: 'note', urgent: false };
  }
}

/** The text that follows the notches: "Hold", "Hold · urgent", "Watch" ... */
export function gaugeText(level: GaugeLevel, urgent = false): string {
  return urgent && level === 'hold' ? 'Hold · urgent' : GAUGE_WORD[level];
}

/**
 * Three upright 4x14 notches plus the word. Colour is the second channel, the
 * fill count is the first (WCAG 1.4.1). `animate` plays the 420ms left-to-right
 * fill once (static under reduced motion), so this stays a server component.
 * With `showWord={false}` the mark becomes an image with the word as its name.
 */
export function Gauge({
  level,
  urgent = false,
  showWord = true,
  animate,
  className,
}: {
  level: GaugeLevel;
  urgent?: boolean;
  showWord?: boolean;
  animate?: boolean;
  className?: string;
}) {
  const filled = GAUGE_FILLED[level];
  const text = gaugeText(level, urgent);
  return (
    <span
      data-level={level}
      role={showWord ? undefined : 'img'}
      aria-label={showWord ? undefined : text}
      className={cn('inline-flex min-w-0 shrink-0 items-center gap-s2', LEVEL_TEXT[level], animate && 'gauge-animate', className)}
    >
      <span aria-hidden="true" className="inline-flex items-center gap-[3px]">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            data-filled={i < filled}
            className="gauge-notch"
            style={{ '--i': i } as React.CSSProperties}
          />
        ))}
      </span>
      {showWord ? <span className="font-sans text-label font-semibold">{text}</span> : null}
    </span>
  );
}

/** Packages with no incident. Never "Clear": nothing records "evaluated, zero findings". */
export function NoFlags({ className }: { className?: string }) {
  return <span className={cn('font-sans text-label text-fg-mute', className)}>No flags</span>;
}
