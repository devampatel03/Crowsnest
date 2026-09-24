import { cn, severityConfig } from '@/lib/utils';
import type { Severity } from '@/lib/types';

interface SeverityBadgeProps {
  severity: Severity;
  className?: string;
}

export function SeverityBadge({ severity, className }: SeverityBadgeProps) {
  const config = severityConfig(severity);
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border',
        config.color,
        config.bg,
        config.border,
        className,
      )}
    >
      {config.label}
    </span>
  );
}

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'dim';
  className?: string;
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  const variants = {
    default: 'bg-surface-2 text-text-secondary border-border',
    success: 'bg-success/10 text-success border-success/30',
    warning: 'bg-severity-medium-bg text-severity-medium border-severity-medium-border',
    danger: 'bg-severity-critical-bg text-severity-critical border-severity-critical-border',
    dim: 'bg-surface text-text-muted border-border-soft',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-xs border',
        variants[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
