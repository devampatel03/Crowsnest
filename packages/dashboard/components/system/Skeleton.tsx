import { cn } from '@/lib/format';

const WIDTHS = ['62%', '84%', '48%', '73%', '56%', '90%'];

/** Ruled lines at row height with a 1.2s opacity pulse (static under reduced motion). No spinner exists. */
export function SkeletonRows({ rows, rowHeight = 40, label }: { rows: number; rowHeight?: number; label: string }) {
  return (
    <div role="status">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="skeleton-pulse">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} style={{ height: rowHeight }} className="flex items-center border-b border-rule">
            <span className="block h-px bg-rule-strong" style={{ width: WIDTHS[i % WIDTHS.length] }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** A single ruled placeholder block (a numeral or a headline while data loads). Decorative; pair with a status label. */
export function Skeleton({ className, width = '60%' }: { className?: string; width?: string }) {
  return (
    <span aria-hidden="true" className={cn('skeleton-pulse flex h-7 items-center border-b border-rule', className)}>
      <span className="block h-px bg-rule-strong" style={{ width }} />
    </span>
  );
}
