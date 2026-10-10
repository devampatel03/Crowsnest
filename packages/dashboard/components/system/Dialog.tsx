'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/format';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

/**
 * Radix portals to <body>, outside the [data-surface] wrapper, which would
 * lose the surface tokens. DialogContent mounts only when open, so it can read
 * the surface of the focused trigger (or the first surface on the page) once.
 */
function findSurface(): HTMLElement | undefined {
  if (typeof document === 'undefined') return undefined;
  const active = document.activeElement as HTMLElement | null;
  return (
    (active?.closest('[data-surface]') as HTMLElement | null) ??
    (document.querySelector('[data-surface]') as HTMLElement | null) ??
    undefined
  );
}

/**
 * 12px-radius panel, 1px strong hairline, backdrop only (no shadow, no blur).
 * There is no destructive style: a confirmation is a Primary inside the dialog.
 */
export function DialogContent({
  title,
  description,
  sheetBelow,
  children,
}: {
  title: string;
  description?: string;
  sheetBelow?: 768;
  children: ReactNode;
}) {
  const [container] = useState(findSurface);
  // Opened from code (no Radix trigger), so remember the opener and hand focus back on close.
  const [opener] = useState<Element | null>(() => (typeof document === 'undefined' ? null : document.activeElement));
  return (
    <DialogPrimitive.Portal container={container}>
      <DialogPrimitive.Overlay className="overlay-in fixed inset-0 z-50 bg-backdrop" />
      <DialogPrimitive.Content
        {...(description ? {} : { 'aria-describedby': undefined })}
        onCloseAutoFocus={(e) => {
          if (opener instanceof HTMLElement && opener.isConnected && opener !== document.body) {
            e.preventDefault();
            opener.focus();
          }
        }}
        className={cn(
          'dialog-in fixed z-50 flex max-h-[85vh] flex-col overflow-y-auto rounded-panel border border-rule-strong bg-surface text-fg',
          'left-1/2 top-1/2 w-[min(35rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2',
          sheetBelow && 'max-md:inset-x-0 max-md:bottom-0 max-md:left-0 max-md:top-auto max-md:w-full max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-b-none',
        )}
      >
        <div className="flex items-start justify-between gap-s3 border-b border-rule px-s4 py-s3">
          <div className="flex min-w-0 flex-col gap-s1">
            <DialogPrimitive.Title className="m-0 font-sans text-h3 text-fg">{title}</DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="m-0 text-body-s text-fg-soft">{description}</DialogPrimitive.Description>
            ) : null}
          </div>
          <DialogPrimitive.Close
            aria-label="Close"
            className="inline-flex min-h-8 shrink-0 items-center rounded-ctl border border-field px-s3 font-sans text-label text-fg hover:bg-raised max-md:min-h-11"
          >
            Close
          </DialogPrimitive.Close>
        </div>
        <div className="px-s4 py-s4">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogFooter({ children }: { children: ReactNode }) {
  return <div className="mt-s4 flex flex-wrap items-center justify-end gap-s3">{children}</div>;
}
