import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));

/** Keeps head and tail with a single ellipsis; result length is at most `max`. */
export function truncateMiddle(s: string, max: number): string {
  if (max < 1) return '';
  if (s.length <= max) return s;
  if (max === 1) return '…';
  const keep = max - 1;
  const head = Math.ceil(keep / 2);
  const tail = Math.floor(keep / 2);
  return s.slice(0, head) + '…' + (tail > 0 ? s.slice(-tail) : '');
}

/** Drops leading path segments but always keeps the basename. */
export function truncateLeft(path: string, max: number): string {
  if (max < 1) return '';
  if (path.length <= max) return path;
  const base = path.split(/[\\/]/).pop() ?? path;
  if (base.length >= max) return truncateMiddle(base, max);
  return '…' + path.slice(-(max - 1));
}
