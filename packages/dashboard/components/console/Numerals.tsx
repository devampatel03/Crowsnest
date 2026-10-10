import { squigglePath } from '@/components/system/sketch-path';
import type { Stat } from '@/components/system';
import { cn } from '@/lib/format';

/** A short pencil line under a numeral. Decorative; the number above it is the content. */
function HandBaseline({ variant }: { variant: 1 | 2 | 3 }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 120 8" preserveAspectRatio="none" className="block h-2 w-full max-w-[10rem] overflow-visible fill-none" data-hand-baseline>
      <path d={squigglePath(variant)} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeWidth={1.5} className="stroke-rule-strong" />
    </svg>
  );
}

/**
 * Three numerals on one row at every width (no orphan wrap). Each sits on a
 * hand-drawn baseline instead of a box or a divider; Hold stays in the Hold
 * colour, the others are neutral. The numbers are text, so the colour is never
 * the only signal (the label says Hold).
 */
export function Numerals({ items }: { items: Stat[] }) {
  return (
    <section aria-label="Counts">
      <dl className="m-0 grid grid-cols-3 gap-x-s3 md:gap-x-s5">
        {items.map((s, i) => (
          <div key={s.id} className="flex min-w-0 flex-col gap-1 py-s1">
            <dt className="label order-2 break-words">{s.label}</dt>
            <dd className={cn('stat-l order-1 m-0 flex flex-col gap-1', s.hold ? 'text-hold' : 'text-fg')}>
              <span>
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
              </span>
              <HandBaseline variant={((i % 3) + 1) as 1 | 2 | 3} />
            </dd>
            {s.baseline ? <dd className="order-3 m-0 text-body-s text-fg-mute">{s.baseline}</dd> : null}
          </div>
        ))}
      </dl>
    </section>
  );
}
