import { cn } from '@/lib/utils';

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'w-5 h-5 border-2 border-border border-t-primary rounded-full animate-spin',
        className,
      )}
    />
  );
}

export function PageSpinner() {
  return (
    <div className="flex items-center justify-center h-full min-h-[200px]">
      <Spinner className="w-8 h-8" />
    </div>
  );
}
