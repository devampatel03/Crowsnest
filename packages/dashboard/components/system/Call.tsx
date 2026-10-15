import type { ReactNode } from 'react';
import { cn } from '@/lib/format';
import { Gauge, type GaugeLevel } from './Gauge';

/**
 * The Call: every verdict is a short sentence in a fixed shape,
 * `[gauge] Hold` · what happened · what to do. Console form: the headline in
 * an h3, a quiet detail line under it (`package@version · used in 3 projects ·
 * found 2 days ago`), then the gauge and word with "What to do". No
 * confidence decimals and no pattern codes ever reach this component.
 *
 * Server component. The console wraps it in an expandable CallCard.
 */
export function Call({
  level,
  urgent,
  headline,
  detail,
  advice,
  adviceLabel = 'What to do',
  headingLevel = 3,
  variant = 'card',
  animate,
  children,
  className,
}: {
  level: GaugeLevel;
  urgent?: boolean;
  /** What happened, one sentence. */
  headline: ReactNode;
  /** Quiet line under the headline. */
  detail?: ReactNode;
  /** What to do. A single node, or an array whose first item is the main action. */
  advice?: ReactNode | ReactNode[];
  adviceLabel?: string;
  headingLevel?: 2 | 3 | 4;
  /** `card`: bordered panel. `inline`: no border, for hero, sandbox and articles. */
  variant?: 'card' | 'inline';
  animate?: boolean;
  /** Extra content under the advice (expanded details, who else is affected). */
  children?: ReactNode;
  className?: string;
}) {
  const H = `h${headingLevel}` as 'h2' | 'h3' | 'h4';
  const items = Array.isArray(advice) ? advice : advice ? [advice] : [];
  const [main, ...rest] = items;
  return (
    <article
      data-level={level}
      className={cn(
        'flex min-w-0 flex-col gap-s3',
        variant === 'card' && 'rounded-panel border border-rule bg-surface p-s4',
        className,
      )}
    >
      <div className="flex flex-col gap-s1">
        <H className="m-0 font-sans text-h3 text-fg">{headline}</H>
        {detail ? <p className="m-0 text-body-s text-fg-mute">{detail}</p> : null}
      </div>
      <div className="flex flex-col gap-s2">
        <Gauge level={level} urgent={urgent} animate={animate} />
        {main ? (
          <div className="flex flex-col gap-s1">
            <p className="label m-0">{adviceLabel}</p>
            <div className="text-body text-fg">{main}</div>
            {rest.length > 0 ? (
              <ul className="m-0 flex list-disc flex-col gap-s1 pl-s4 text-body-s text-fg-soft marker:text-fg-mute">
                {rest.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
      {children}
    </article>
  );
}
