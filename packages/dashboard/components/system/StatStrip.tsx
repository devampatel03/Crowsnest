import { useId } from 'react';
import { cn } from '@/lib/format';

export type Stat = {
  id: string;
  label: string;
  value: number | string | null;
  /** Only when a prior window exists ("was 4, a week ago"). */
  baseline?: string;
  /** Marks the one numeral that counts Holds. */
  hold?: boolean;
};

/** Serif numerals separated by 1px lines, never tiles. null value renders an em dash. 2x2 below 768. */
export function StatStrip({ items, srLabel }: { items: Stat[]; srLabel: string }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="sr-only">
        {srLabel}
      </h2>
      <dl
        className="m-0 grid grid-cols-2 md:[grid-template-columns:repeat(var(--n),minmax(0,1fr))]"
        style={{ '--n': items.length } as React.CSSProperties}
      >
        {items.map((s) => (
          <div
            key={s.id}
            className="flex min-w-0 flex-col gap-s1 border-rule px-s4 py-s3 max-md:border-t max-md:[&:nth-child(-n+2)]:border-t-0 max-md:even:border-l md:border-l md:first:border-l-0 md:first:pl-0"
          >
            <dt className="label order-2">{s.label}</dt>
            <dd className={cn('stat-l order-1 m-0', s.hold ? 'text-hold' : 'text-fg')}>
              {s.value === null ? (
                <>
                  <span aria-hidden="true">—</span>
                  <span className="sr-only">no data</span>
                </>
              ) : typeof s.value === 'number' ? (
                s.value.toLocaleString('en-US')
              ) : (
                s.value
              )}
            </dd>
            {s.baseline ? <dd className="order-3 m-0 text-body-s text-fg-mute">{s.baseline}</dd> : null}
          </div>
        ))}
      </dl>
    </section>
  );
}
