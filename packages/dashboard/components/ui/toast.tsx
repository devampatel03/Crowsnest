'use client';

import * as React from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ToastItem } from './toast-provider';

const TONE_CONFIG = {
  success: {
    icon: CheckCircle2,
    border: 'border-l-success',
    iconColor: 'text-success',
  },
  error: {
    icon: XCircle,
    border: 'border-l-severity-critical',
    iconColor: 'text-severity-critical',
  },
  info: {
    icon: Info,
    border: 'border-l-primary-400',
    iconColor: 'text-primary-400',
  },
} as const;

interface ToastStackProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  const [visible, setVisible] = React.useState(false);
  const { icon: Icon, border, iconColor } = TONE_CONFIG[toast.tone];

  React.useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      role="status"
      className={cn(
        'flex items-center gap-2 rounded-lg border border-l-4 border-border bg-surface px-4 py-3 text-sm text-text-primary shadow-panel',
        'transition-all duration-200 ease-out',
        visible ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0',
        border
      )}
    >
      <Icon className={cn('h-4 w-4 shrink-0', iconColor)} />
      <span className="flex-1">{toast.message}</span>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 rounded p-0.5 text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
      >
        <X className="h-3.5 w-3.5" />
        <span className="sr-only">Dismiss</span>
      </button>
    </div>
  );
}
