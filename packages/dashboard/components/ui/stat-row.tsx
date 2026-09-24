import { cn } from '@/lib/utils';

export type StatTone = 'critical' | 'high' | 'medium' | 'low' | 'default';

interface Stat {
  label: string;
  value: number | string;
  tone?: StatTone;
}

interface StatRowProps {
  stats: Stat[];
  className?: string;
}

const toneClasses: Record<StatTone, string> = {
  critical: 'text-severity-critical',
  high: 'text-severity-high',
  medium: 'text-severity-medium',
  low: 'text-severity-low',
  default: 'text-text-primary',
};

export function StatRow({ stats, className }: StatRowProps) {
  return (
    <div className={cn('flex items-center gap-6', className)}>
      {stats.map((stat, i) => (
        <div key={i} className="flex flex-col">
          <span className={cn('text-2xl font-mono font-bold', toneClasses[stat.tone ?? 'default'])}>
            {stat.value}
          </span>
          <span className="text-xs text-text-muted mt-0.5">{stat.label}</span>
        </div>
      ))}
    </div>
  );
}
