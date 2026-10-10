'use client';

import { useEffect, useState } from 'react';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { chartTheme } from './theme';

/** True only for the first mount window (600ms) and never under reduced motion; later data changes never animate. */
export function useMountAnimation(): boolean {
  const reduced = useReducedMotion();
  const [first, setFirst] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setFirst(false), chartTheme.animationMs + 100);
    return () => clearTimeout(id);
  }, []);
  return first && !reduced;
}
