import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils';

// NOTE: Radix Tooltip requires the tree to be wrapped in <TooltipProvider> once,
// near the app root (e.g. in `app/(dashboard)/layout.tsx`). That wiring is out
// of scope for this file — a later agent owns layout.tsx and should mount
// <TooltipProvider> there.
const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, children, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 rounded-lg border border-border bg-surface-2 px-2 py-1 text-xs text-text-primary shadow-panel',
        'transition-opacity duration-150',
        className
      )}
      {...props}
    >
      {children}
      <TooltipPrimitive.Arrow className="fill-surface-2" />
    </TooltipPrimitive.Content>
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
