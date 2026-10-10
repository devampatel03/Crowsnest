import type { ReactNode } from 'react';
import { Squiggle } from '@/components/system/Squiggle';

/** Visible date; the `<time>` text equals the JSON-LD date the page emits. */
export function DateStamp({ label, date }: { label: string; date: string }) {
  return (
    <p className="label m-0">
      {label} <time dateTime={date}>{date}</time>
    </p>
  );
}

/**
 * Title block: the one H1, dates, optional byline, optional children (the
 * italic answer-first lead goes below, in the page). `size` m is for posts and
 * glossary terms, l for docs and index pages.
 */
export function ArticleHead({
  h1,
  size = 'l',
  dates,
  byline,
  spot,
  squiggleId,
  children,
}: {
  h1: string;
  size?: 'l' | 'm';
  dates: { label: string; date: string }[];
  byline?: string;
  /** Decorative Nib spot beside the title (120px at most). */
  spot?: ReactNode;
  /** When set, the last word of the H1 gets the pencil underline (docs H1s). */
  squiggleId?: string;
  children?: ReactNode;
}) {
  const i = h1.lastIndexOf(' ');
  const title =
    squiggleId && i > 0 ? (
      <>
        {h1.slice(0, i + 1)}
        <Squiggle id={squiggleId}>{h1.slice(i + 1)}</Squiggle>
      </>
    ) : (
      h1
    );
  return (
    <header className="flex flex-col gap-s3 pb-s4 pt-s5">
      <div className="flex items-end justify-between gap-s4">
        <h1 className={`m-0 break-words font-display text-fg ${size === 'l' ? 'text-display-l' : 'text-display-m'}`}>{title}</h1>
        {spot ? (
          <div aria-hidden="true" className="w-[4.5rem] shrink-0 md:w-[6.5rem] [&_svg]:h-auto [&_svg]:w-full">
            {spot}
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-s4 gap-y-s1">
        {byline ? <p className="label m-0">By {byline}</p> : null}
        {dates.map((d) => (
          <DateStamp key={d.label} {...d} />
        ))}
      </div>
      {children}
    </header>
  );
}
