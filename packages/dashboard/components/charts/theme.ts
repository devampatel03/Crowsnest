/**
 * Shared Recharts theme. Every value is a CSS variable (or a colour-mix of
 * one) from app/globals.css. The `--c-*` layer flips with the nearest
 * [data-surface] ancestor, so charts follow the one paper theme. SVG presentation attributes accept var(), so these strings go straight
 * into stroke / fill props. Nothing here is a hex value.
 *
 * Series colours come from two channels only:
 *   neutrals   fg / fg-soft / fg-mute        (counts, categories)
 *   gauge      hold / watch                  (only where the series IS that level)
 * `note` is neutral (it never means "clear").
 */
export const chartTheme = {
  /** Neutral series, strongest first. */
  series1: 'var(--c-fg)',
  series2: 'var(--c-fg-soft)',
  series3: 'var(--c-fg-mute)',
  /** Brand beam: neutral single-series bars (ranking). */
  brand: 'var(--c-brand)',
  /** Gauge levels. */
  hold: 'var(--c-hold)',
  watch: 'var(--c-watch)',
  note: 'var(--c-fg-mute)',
  /** Chrome. Grid is 6% of the foreground on either surface; the baseline is stronger. */
  grid: 'color-mix(in srgb, var(--c-fg) 6%, transparent)',
  axisLine: 'color-mix(in srgb, var(--c-fg) 24%, transparent)',
  axisText: 'var(--c-fg-mute)',
  cursor: 'color-mix(in srgb, var(--c-fg) 8%, transparent)',
  /** Separates stacked segments and active marks from what is behind them. */
  surface: 'var(--c-surface)',
  font: 'var(--font-sans), system-ui, sans-serif',
  fontSize: 11,
  strokeWidth: 1.5,
  /** Wave lines. */
  stroke: 2.25,
  /** The wave's All calls series. */
  all: 'var(--c-brand)',
  /** `margin` for every chart. */
  margin: { top: 8, right: 8, bottom: 0, left: 0 },
  /** First mount only; callers pass `animate && !reducedMotion` and false for SSE updates. */
  animationMs: 600,
} as const;

export type ChartTheme = typeof chartTheme;

/** Shared tick props: Instrument Sans 11px, muted, tabular numerals. */
export const tickStyle = {
  fill: chartTheme.axisText,
  fontFamily: chartTheme.font,
  fontSize: chartTheme.fontSize,
  fontVariantNumeric: 'tabular-nums',
} as const;

/**
 * Neutral tints for categorical stacks (ecosystems). Flat fills, the foreground
 * at decreasing strength. Nothing is coloured by ecosystem.
 */
export const neutralTints = [
  'var(--c-fg-mute)',
  'color-mix(in srgb, var(--c-fg-mute) 70%, transparent)',
  'color-mix(in srgb, var(--c-fg-mute) 48%, transparent)',
  'color-mix(in srgb, var(--c-fg-mute) 32%, transparent)',
  'color-mix(in srgb, var(--c-fg-mute) 20%, transparent)',
] as const;

/**
 * Style source. One place for the wave's fill and the live
 * head. The gradient is the single sanctioned exception to "no gradients": it
 * encodes depth under a data line and is never used on text, UI or backgrounds.
 * Stops read --area-top / --area-bottom from globals.css (0.26 to 0.02); under
 * forced-colors charts.css flattens both stops to a 12% fill.
 */
export const areaFill = (color: string) => ({
  color,
  topOpacity: 'var(--area-top, 0.26)',
  bottomOpacity: 'var(--area-bottom, 0.02)',
});

export const ripple = {
  /** Solid head dot radius (a 5px dot is r 2.5; 3.5 reads better on 2.25 strokes). */
  dotR: 3.5,
  /** Ring radius at rest; CSS scales it 1 to 2.6 over 2s. */
  ringR: 5,
  ms: 2000,
} as const;

/** `useId()` yields `:r1:`; url(#...) wants a plain token. */
export const safeId = (id: string): string => id.replace(/[^a-zA-Z0-9_-]/g, '');
