import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/format';

/**
 * Panel: 12px radius, 1px hairline, `--c-surface` fill, no shadow. The title is
 * a sentence-case `label` (no uppercase, no brackets). `bearing` is kept as
 * the data-bearing hook for the Bearing Rule.
 */
export function Panel({
  label,
  headingLevel = 2,
  bearing,
  meta,
  stale,
  children,
  className,
}: {
  label: string;
  headingLevel?: 2 | 3;
  bearing?: string;
  meta?: ReactNode;
  /** Plain text such as "2:14 pm"; renders "Stale · 2:14 pm". */
  stale?: string | null;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  const H = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <section
      aria-labelledby={id}
      data-bearing={bearing}
      className={cn('min-w-0 rounded-panel border border-rule bg-surface', className)}
    >
      <div className="flex min-h-11 items-center justify-between gap-s3 border-b border-rule px-s4 py-s2">
        <H id={id} className="label m-0">
          {label}
        </H>
        <div className="flex items-center gap-s3">
          {stale ? <span className="label text-fg-mute">Stale · {stale}</span> : null}
          {meta}
        </div>
      </div>
      <div className="p-s4">{children}</div>
    </section>
  );
}

/**
 * 12-column grid. Default: separate panels with a 12px gap. `lines`: panels
 * join into one 12px-radius block drawn by 1px gap lines (use when panels are
 * peers of one object, as in the console).
 */
export function PanelGrid({ children, lines }: { children: ReactNode; lines?: boolean }) {
  return (
    <div
      className={cn(
        'grid grid-cols-12',
        lines
          ? 'gap-px overflow-hidden rounded-panel border border-rule bg-rule [&>section]:rounded-none [&>section]:border-0'
          : 'gap-s3',
      )}
    >
      {children}
    </div>
  );
}
