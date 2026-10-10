import type { HTMLAttributes } from 'react';

/**
 * Surface wrapper. There is one theme (cream paper), set on `:root`; this
 * wrapper only marks the element portals (dialogs, toasts, tooltips) attach to
 * so they inherit the page background and ink.
 */
export function Surface({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} data-surface="paper" className={className}>
      {children}
    </div>
  );
}
