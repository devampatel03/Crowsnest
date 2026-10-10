import type { ReactNode } from 'react';
import { cn } from '@/lib/format';

/**
 * Section heading: the title only. There is no eyebrow, no number and no
 * bearing degree here (degrees live on the Bearing Rule only). Headings end
 * in a period at the call site. Level 1 uses the display serif; levels 2 and 3 are Instrument Sans.
 */
export function SectionHead({
  title,
  level,
  children,
}: {
  title: string;
  level: 1 | 2 | 3;
  children?: ReactNode;
}) {
  const H = `h${level}` as 'h1' | 'h2' | 'h3';
  const style =
    level === 1
      ? 'font-display text-display-l'
      : 'font-sans text-h2';
  return (
    <header className="flex flex-col gap-s3">
      <H className={cn('m-0 text-fg', style)}>{title}</H>
      {children}
    </header>
  );
}

/** "Quotable facts": a plain dated bulleted list. h2 per the heading plan. */
export function FactList({ heading = 'Quotable facts', asOf, facts }: { heading?: string; asOf: string; facts: string[] }) {
  return (
    <section>
      <h2 className="m-0 font-sans text-h3 text-fg">{heading}</h2>
      <p className="mb-s2 mt-s1 text-body-s text-fg-mute">As of {asOf}</p>
      <ul className="m-0 list-disc pl-s4 marker:text-fg-mute">
        {facts.map((f) => (
          <li key={f} className="mt-s1 text-body-s text-fg-soft">
            {f}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Answer-first lead: italic Instrument Serif, one per article (<= 50 words). */
export function AnswerBox({ children }: { children: ReactNode }) {
  return <div className="answer-box">{children}</div>;
}
