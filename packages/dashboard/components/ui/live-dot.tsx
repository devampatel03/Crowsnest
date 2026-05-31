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
          'w-2 h-2 rounded-full live-dot',
          connected ? 'bg-emerald-400' : 'bg-red-500',
        )}
      />
      <span className={connected ? 'text-emerald-400' : 'text-red-400'}>
        {connected ? 'LIVE' : 'RECONNECTING'}
      </span>
    </span>
  );
}
