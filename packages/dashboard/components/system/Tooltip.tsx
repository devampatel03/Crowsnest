'use client';

import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import type { ReactElement, ReactNode } from 'react';

/**
 * Instrument Sans 13px, raised fill, 1px strong hairline, 6px radius, no
 * arrow. Content is intentionally NOT portalled so it inherits the
 * [data-surface] tokens (Radix popper positions it with position: fixed, so
 * clipping is not a concern). The trigger must be focusable; the tooltip also
 * opens on focus.
 */
export function Tooltip({
  content,
  children,
  side = 'top',
}: {
  content: ReactNode;
  children: ReactElement;
  side?: 'top' | 'bottom' | 'left' | 'right';
}) {
  return (
    <TooltipPrimitive.Provider delayDuration={200}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="z-50 max-w-xs rounded-ctl border border-rule-strong bg-raised px-s3 py-s1 font-sans text-label text-fg"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
