import type { ReactNode } from 'react';

export interface TooltipRow {
  label: string;
  value: ReactNode;
  /** Word that doubles a colour, e.g. `Hold`. */
  tag?: string;
  /** Colour swatch (a CSS colour); decorative, the label carries the meaning. */
  swatch?: string;
}

/**
 * Tooltip panel: surface fill, 1px strong line and the 6px control radius, like
 * the console panels. Title is plain ("Tue 12 May"), the mono subtitle is the
 * ISO timestamp, values are tabular.
 */
export function TooltipPanel({ title, subtitle, rows }: { title: string; subtitle?: string; rows: TooltipRow[] }) {
  return (
    <div
      role="tooltip"
      className="pointer-events-none min-w-[10.5rem] rounded-ctl border border-rule-strong bg-surface px-s3 py-s2 text-body-s text-fg"
    >
      <p className="m-0 font-semibold text-fg">{title}</p>
      {subtitle ? <p className="m-0 text-[0.6875rem] tabular-nums text-fg-mute">{subtitle}</p> : null}
      <dl className="m-0 mt-s1 flex flex-col gap-[2px]">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-s4">
            <dt className="flex items-center gap-s1 text-fg-soft">
              {r.swatch ? (
                <span aria-hidden="true" className="inline-block h-2 w-2 rounded-[2px]" style={{ background: r.swatch }} />
              ) : null}
              {r.label}
            </dt>
            <dd className="m-0 text-right tabular-nums">
              {r.value}
              {r.tag ? <span className="text-fg-mute"> {r.tag}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
