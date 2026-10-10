'use client';

import { useId, useState, type ReactNode } from 'react';
import { cn } from '@/lib/format';

/**
 * Collapsed menu below the `xl` breakpoint, always open at `xl` and up (docs
 * sidebar and on-page TOC). The panel is always in the server HTML; `hidden`
 * toggles under 1280px and `xl:block` forces it open above.
 */
export function Disclosure({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 w-full items-center justify-between border-y border-rule px-s2 font-sans text-label text-fg xl:hidden"
      >
        <span>{label}</span>
        <span aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      <div id={id} className={cn(open ? 'block' : 'hidden', 'xl:block')}>
        {children}
      </div>
    </div>
  );
}
