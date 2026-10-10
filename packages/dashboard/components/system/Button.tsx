import Link from 'next/link';
import { forwardRef, useId, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ElementType } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/format';

export type ButtonProps = {
  variant?: 'primary' | 'secondary' | 'tertiary';
  /** `sm` is the compact header size. */
  size?: 'md' | 'sm';
  /** Trailing "→". Default: on for primary and tertiary, off for secondary. */
  arrow?: boolean;
  href?: string;
  rel?: string;
  target?: string;
  loading?: boolean;
  /** Renders a primary as a secondary (one beam fill per viewport). */
  demoted?: boolean;
  /** Visible line shown under a disabled button and wired with aria-describedby. */
  disabledReason?: string;
} & ButtonHTMLAttributes<HTMLButtonElement>;

const VARIANT = {
  primary: 'btn btn-primary',
  secondary: 'btn btn-secondary',
  tertiary: 'btn btn-tertiary',
} as const;

/** The arrow is Nib's beak: a pencil shaft ending in the beak triangle with its slit. */
function BeakArrow() {
  return (
    <span aria-hidden="true" className="btn-arrow">
      <svg viewBox="0 0 22 14" focusable="false">
        <path d="M1 7.4 Q6 6.3 12.6 7.1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M12 2.2 C15.6 3.6 18.8 5.4 21 7.4 C18.8 9.4 15.6 11.2 12.4 12.6 Z" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
        <path d="M14 7.3 L18.6 7.4" fill="none" stroke="var(--c-cta)" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    </span>
  );
}

/**
 * Sketch-style buttons: a yellow primary, a cream secondary, a link-style tertiary. The look lives
 * in app/buttons.css. No danger or ghost variant exists; sentence-case labels
 * ("Install Crowsnest").
 * Renders an anchor when `href` is set; internal paths use next/link.
 */
export const Button = forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', arrow, href, rel, target, loading, demoted, disabledReason, className, children, disabled, type, ...rest },
  ref,
) {
  const reasonId = useId();
  const effective = variant === 'primary' && demoted ? 'secondary' : variant;
  const showArrow = arrow ?? effective !== 'secondary';
  const classes = cn(VARIANT[effective], size === 'sm' && effective !== 'tertiary' && 'btn-sm', className);
  const content = (
    <>
      <span className="btn-label">
        {children}
        {loading ? '…' : null}
      </span>
      {showArrow ? <BeakArrow /> : null}
    </>
  );

  if (href !== undefined) {
    const external = /^https?:\/\//.test(href);
    const anchorProps = rest as unknown as AnchorHTMLAttributes<HTMLAnchorElement>;
    if (external || target) {
      return (
        <a
          {...anchorProps}
          ref={ref as React.Ref<HTMLAnchorElement>}
          href={href}
          target={target}
          rel={rel ?? (external ? 'noopener' : undefined)}
          className={classes}
          aria-busy={loading || undefined}
        >
          {content}
        </a>
      );
    }
    const L = Link as ElementType;
    return (
      <L {...anchorProps} ref={ref} href={href} rel={rel} className={classes} aria-busy={loading || undefined}>
        {content}
      </L>
    );
  }

  const isDisabled = !!(disabled || loading);
  const showReason = !!disabledReason && isDisabled;
  const button = (
    <button
      {...rest}
      ref={ref as React.Ref<HTMLButtonElement>}
      type={type ?? 'button'}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      aria-describedby={showReason ? [reasonId, rest['aria-describedby']].filter(Boolean).join(' ') : rest['aria-describedby']}
      className={classes}
    >
      {content}
    </button>
  );
  if (!showReason) return button;
  return (
    <span className="inline-flex flex-col items-start gap-s1">
      {button}
      <span id={reasonId} className="text-body-s text-fg-mute">
        {disabledReason}
      </span>
    </span>
  );
});

/** Square toolbar button; `label` becomes the required aria-label. */
export const IconButton = forwardRef<
  HTMLButtonElement,
  { label: string; icon: LucideIcon; pressed?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>
>(function IconButton({ label, icon: Icon, pressed, className, type, ...rest }, ref) {
  return (
    <button
      {...rest}
      ref={ref}
      type={type ?? 'button'}
      aria-label={label}
      aria-pressed={pressed}
      className={cn('btn btn-secondary btn-icon', className)}
    >
      <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
});
