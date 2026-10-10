import Link from 'next/link';
import type { ReactNode } from 'react';

// Public-page blocks: plain text rows with a 1px bottom line (no cards, no
// numbering, no ledger geometry). Server components, tokens only.

export type LinkRowItem = {
  title: string;
  line?: string;
  href: string;
  /** Right-hand meta text (date, reading time). */
  meta?: string;
  external?: boolean;
  /** Small decorative image at the left of the row (blog cover crop). */
  thumb?: ReactNode;
};

/** Plain link rows: title, one line, optional meta. `titleLevel` makes the title a heading. */
export function LinkRows({
  items,
  titleLevel,
  label,
}: {
  items: LinkRowItem[];
  titleLevel?: 2 | 3;
  label?: string;
}) {
  const Title = titleLevel ? (`h${titleLevel}` as 'h2' | 'h3') : 'span';
  return (
    <ul aria-label={label} className="m-0 list-none border-t border-rule p-0">
      {items.map((it) => {
        const text = (
          <>
            <Title className="m-0 block font-sans text-h3 text-fg group-hover:underline group-hover:underline-offset-4">
              {it.title}
            </Title>
            {it.line ? <span className="mt-1 block max-w-prose text-body-s text-fg-soft md:text-body">{it.line}</span> : null}
            {it.meta ? <span className="mt-1 block text-body-s text-fg-mute">{it.meta}</span> : null}
          </>
        );
        const inner = it.thumb ? (
          <span className="flex items-center gap-s3">
            <span aria-hidden="true" className="block w-[5.5rem] shrink-0 overflow-hidden rounded-ctl [&_svg]:h-auto [&_svg]:w-full">
              {it.thumb}
            </span>
            <span className="block min-w-0">{text}</span>
          </span>
        ) : (
          text
        );
        const cls = 'group block min-h-14 border-b border-rule py-s3 no-underline hover:bg-raised md:px-s2';
        return (
          <li key={it.href + it.title}>
            {it.external ? (
              <a href={it.href} rel="noopener" className={cls}>
                {inner}
              </a>
            ) : (
              <Link href={it.href} className={cls}>
                {inner}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export type PagerLink = { title: string; href: string } | null;

/** Previous / next as two plain links. */
export function PagerPair({ prev, next }: { prev: PagerLink; next: PagerLink }) {
  if (!prev && !next) return null;
  return (
    <nav aria-label="Previous and next" className="grid grid-cols-1 gap-s3 md:grid-cols-2">
      {prev ? (
        <Link
          href={prev.href}
          rel="prev"
          className="group flex min-h-16 flex-col justify-center gap-1 rounded-ctl border border-rule px-s3 py-s2 no-underline hover:bg-raised"
        >
          <span className="label">Previous</span>
          <span className="font-sans text-h3 text-fg group-hover:underline group-hover:underline-offset-4">{prev.title}</span>
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link
          href={next.href}
          rel="next"
          className="group flex min-h-16 flex-col justify-center gap-1 rounded-ctl border border-rule px-s3 py-s2 no-underline hover:bg-raised md:items-end md:text-right"
        >
          <span className="label">Next</span>
          <span className="font-sans text-h3 text-fg group-hover:underline group-hover:underline-offset-4">{next.title}</span>
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

/** Related pages as plain rows under an h2. */
export function RelatedLinks({ items }: { items: LinkRowItem[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="related-heading" className="mt-s6">
      <h2 id="related-heading" className="m-0 mb-s3 font-sans text-h2 text-fg">
        Related
      </h2>
      <LinkRows items={items} />
    </section>
  );
}
