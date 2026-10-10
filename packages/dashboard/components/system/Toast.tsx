'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/format';

type Tone = 'info' | 'success' | 'error' | 'hold';
type ToastInput = {
  message: string;
  tone?: Tone;
  persist?: boolean;
  id?: string;
  action?: { label: string; onSelect: () => void };
  /** Decorative mini mascot (info, success, error). Ignored on Hold toasts, which carry no art. */
  icon?: ReactNode;
};
type ToastItem = ToastInput & { id: string };

type ToastApi = { toast: (t: ToastInput) => string; dismiss: (id: string) => void };

const ToastContext = createContext<ToastApi | null>(null);

const MAX = 3;
const AUTO_DISMISS_MS = 6000;
let counter = 0;

/**
 * Bottom-left, one line each, stacking at most 3. Hold toasts persist, carry a
 * 2px --c-hold left bar and use role="alert"; errors also use role="alert";
 * others auto-dismiss after 6s with role="status". Mount inside the
 * [data-surface] wrapper so tokens apply.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setItems((cur) => cur.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = input.id ?? `toast-${++counter}`;
      const persist = input.persist || input.tone === 'hold';
      const existing = timers.current.get(id);
      if (existing) clearTimeout(existing);
      timers.current.delete(id);
      if (!persist) timers.current.set(id, setTimeout(() => dismiss(id), AUTO_DISMISS_MS));
      setItems((cur) => [...cur.filter((x) => x.id !== id), { ...input, id }].slice(-MAX));
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((t) => clearTimeout(t));
      map.clear();
    };
  }, []);

  const api = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-label="Notifications" className="pointer-events-none fixed bottom-s4 left-s4 z-50 flex w-[min(26.25rem,calc(100vw-2.75rem))] flex-col gap-s2">
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'hold' || t.tone === 'error' ? 'alert' : 'status'}
            data-tone={t.tone ?? 'info'}
            className={cn(
              'toast-in pointer-events-auto flex items-center gap-s3 rounded-ctl border border-rule-strong bg-raised px-s3 py-s2 font-sans text-body-s text-fg',
              t.tone === 'hold' && 'border-l-2 border-l-hold',
            )}
          >
            {t.icon && t.tone !== 'hold' ? (
              <span aria-hidden="true" data-toast-icon className="shrink-0">
                {t.icon}
              </span>
            ) : null}
            {t.tone === 'hold' || t.tone === 'error' ? (
              <span className="label shrink-0 font-semibold text-fg">{t.tone === 'hold' ? 'Hold' : 'Error'}</span>
            ) : null}
            <span className="min-w-0 flex-1">{t.message}</span>
            {t.action ? (
              <button
                type="button"
                onClick={() => {
                  t.action?.onSelect();
                  dismiss(t.id);
                }}
                className="label shrink-0 text-brand underline underline-offset-4 max-md:min-h-11"
              >
                {t.action.label}
              </button>
            ) : null}
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => dismiss(t.id)}
              className="label inline-flex min-h-6 shrink-0 items-center px-1 max-md:min-h-11"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
