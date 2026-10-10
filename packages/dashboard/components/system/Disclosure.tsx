'use client';

import { useId, useState, type ReactNode } from 'react';
import { cn } from '@/lib/format';

export type DisclosureItem = { id: string; question: string; answer: ReactNode };

/**
 * Plain disclosures: h3 > button[aria-expanded][aria-controls] with a text
 * plus/minus. No numbering. Panels are always in the HTML (`hidden` toggled),
 * so answers stay in the server markup for search and machines.
 */
export function Disclosure({ items, defaultOpenId }: { items: DisclosureItem[]; defaultOpenId?: string }) {
  const base = useId();
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set(defaultOpenId ? [defaultOpenId] : []));

  const toggle = (id: string) =>
    setOpen((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="border-t border-rule">
      {items.map((it) => {
        const isOpen = open.has(it.id);
        const btnId = `${base}-b-${it.id}`;
        const panelId = `${base}-p-${it.id}`;
        return (
          <div key={it.id} className="border-b border-rule">
            <h3 className="m-0">
              <button
                id={btnId}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => toggle(it.id)}
                className="flex min-h-14 w-full items-center gap-s3 py-s3 text-left font-sans text-h3 text-fg transition-colors duration-ui ease-lookout hover:text-brand max-md:min-h-11"
              >
                <span className="min-w-0 flex-1">{it.question}</span>
                <span aria-hidden="true" className="shrink-0 pr-s2 font-sans text-[1.25rem] leading-none text-fg-mute">
                  {isOpen ? '−' : '+'}
                </span>
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={btnId}
              hidden={!isOpen}
              className={cn('max-w-prose pb-s4 text-body text-fg-soft')}
            >
              {it.answer}
            </div>
          </div>
        );
      })}
    </div>
  );
}
