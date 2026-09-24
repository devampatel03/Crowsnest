'use client';

import { cn } from '@/lib/utils';

interface LiveDotProps {
  connected: boolean;
  className?: string;
}

export function LiveDot({ connected, className }: LiveDotProps) {
  return (
    <span className={cn('flex items-center gap-1.5 text-xs', className)}>
      <span
        className={cn(
          'relative inline-flex w-2 h-2',
          connected ? 'text-success' : 'text-severity-critical',
        )}
      >
        <span
          className={cn(
            'w-2 h-2 rounded-full live-dot',
            connected ? 'bg-success' : 'bg-severity-critical',
          )}
        />
        <span className="sonar-ping" />
      </span>
      <span className={connected ? 'text-success' : 'text-severity-critical'}>
        {connected ? 'LIVE' : 'RECONNECTING'}
      </span>
    </span>
  );
}
