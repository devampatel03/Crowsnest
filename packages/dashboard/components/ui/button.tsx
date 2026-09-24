import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'font-medium rounded-lg transition-colors inline-flex items-center gap-2 disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
  {
    variants: {
      variant: {
        primary:
          'bg-accent text-background hover:bg-accent-500 hover:shadow-beacon-glow focus-visible:shadow-beacon-glow',
        secondary:
          'border border-primary-400 text-primary-400 bg-transparent hover:bg-primary-400/10',
        ghost: 'text-text-secondary hover:bg-surface-2 hover:text-text-primary',
        danger:
          'bg-severity-critical-bg text-severity-critical border border-severity-critical-border hover:bg-severity-critical/20 hover:shadow-critical-glow',
      },
      size: {
        sm: 'px-3 py-1.5 text-xs',
        md: 'px-4 py-2 text-sm',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';
