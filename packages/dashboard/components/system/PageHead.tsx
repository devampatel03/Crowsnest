import type { ReactNode } from 'react';

/** Console page head: h1 and a one-line purpose. No page counter, no eyebrow. */
export function PageHead({ title, purpose, children }: { title: string; purpose?: string; children?: ReactNode }) {
  return (
    <header className="flex flex-col gap-s2 py-s4">
      <h1 className="m-0 font-sans text-h2 text-fg">{title}</h1>
      {purpose ? <p className="m-0 max-w-prose text-body-s text-fg-soft">{purpose}</p> : null}
      {children}
    </header>
  );
}
