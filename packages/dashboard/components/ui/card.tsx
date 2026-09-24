import { cn } from '@/lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  glow?: 'red' | 'orange' | 'cyan' | 'none';
}

// NOTE: prop values kept as `red`/`orange`/`cyan`/`none` (rather than renaming to
// `critical`/`amber`/`cyan`/`none`) to avoid breaking the existing call site in
// app/(dashboard)/horizon/page.tsx (`<Card glow={glow}>` with 'red'/'orange'/'none'),
// which is out of this agent's edit scope. Only the underlying shadow tokens changed.
export function Card({ children, className, glow = 'none' }: CardProps) {
  const glowStyles = {
    red: 'border-severity-critical/50 shadow-critical-glow',
    orange: 'border-accent/40 shadow-beacon-glow',
    cyan: 'border-primary/40 shadow-cyan-glow',
    none: '',
  };

  return (
    <div
      className={cn(
        'bg-surface border border-border rounded-xl p-4 shadow-panel',
        glowStyles[glow],
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('flex items-center justify-between mb-3', className)}>{children}</div>;
}

export function CardTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h3 className={cn('text-sm font-semibold text-text-primary', className)}>{children}</h3>;
}
