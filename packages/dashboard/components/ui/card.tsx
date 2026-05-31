import { cn } from '@/lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  glow?: 'red' | 'orange' | 'cyan' | 'none';
}

export function Card({ children, className, glow = 'none' }: CardProps) {
  const glowStyles = {
    red: 'border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)]',
    orange: 'border-orange-500/40 shadow-[0_0_12px_rgba(249,115,22,0.15)]',
    cyan: 'border-cyan-500/40 shadow-[0_0_12px_rgba(34,211,238,0.15)]',
    none: 'border-slate-800',
  };

  return (
    <div
      className={cn(
        'bg-[#0f172a] border rounded-lg p-4',
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
  return <h3 className={cn('text-sm font-semibold text-slate-200', className)}>{children}</h3>;
}
