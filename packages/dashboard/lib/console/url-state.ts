'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Params = Record<string, string>;

/** Pure: keeps only non-default, non-empty values. */
export function serializeParams(values: Params, defaults: Params): string {
  const qs = new URLSearchParams();
  for (const k of Object.keys(defaults)) {
    const v = values[k] ?? defaults[k];
    if (v !== defaults[k] && v !== '') qs.set(k, v);
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

/** Pure: reads known keys from a query string, falling back to defaults. */
export function parseParams(search: string, defaults: Params): Params {
  const qs = new URLSearchParams(search);
  const out: Params = {};
  for (const k of Object.keys(defaults)) out[k] = qs.get(k) ?? defaults[k];
  return out;
}

/**
 * Filter state that lives in the URL (`?v=hold,watch&q=`) so reload and share
 * work. Starts at defaults on the server and first client render (no
 * hydration mismatch), reads the URL in an effect, and writes with
 * history.replaceState (no navigation, no scroll jump).
 */
export function useUrlState<T extends Params>(defaults: T): [T, (patch: Partial<T>) => void, () => void] {
  const defaultsRef = useRef(defaults);
  const [values, setValues] = useState<T>(defaults);

  useEffect(() => {
    setValues(parseParams(window.location.search, defaultsRef.current) as T);
  }, []);

  const write = useCallback((next: T) => {
    const qs = serializeParams(next, defaultsRef.current);
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${qs}${window.location.hash}`);
  }, []);

  const update = useCallback(
    (patch: Partial<T>) => {
      setValues((cur) => {
        const next = { ...cur, ...patch };
        write(next);
        return next;
      });
    },
    [write],
  );

  const reset = useCallback(() => {
    setValues(defaultsRef.current);
    write(defaultsRef.current);
  }, [write]);

  return [values, update, reset];
}
