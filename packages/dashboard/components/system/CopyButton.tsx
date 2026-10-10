'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/format';

/** Tiny client island: copies `text`, announces `Copied.` through a status region. */
export function CopyButton({
  text,
  label = 'Copy',
  accessibleName,
  className,
}: {
  text: string;
  label?: string;
  /** Longer accessible name that starts with the visible label, e.g. "Copy clone command". */
  accessibleName?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? 'Copied' : accessibleName}
        className={cn('btn btn-secondary btn-xs', className)}
      >
        {copied ? 'Copied' : label}
      </button>
      <span role="status" className="sr-only">
        {copied ? 'Copied.' : ''}
      </span>
    </>
  );
}
