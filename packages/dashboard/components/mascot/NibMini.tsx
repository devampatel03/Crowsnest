import type { CSSProperties } from 'react';
import './mascot.css';
import { Beak, Cap, Eye, S } from './parts';

export interface NibMiniProps {
  /** Rendered size in px (square). Default 20. */
  size?: number;
  title?: string;
  /** Default true unless a title is given. */
  decorative?: boolean;
  className?: string;
}

/**
 * Nib's head only: cap, face, beak. For the rope crow, toasts, the wordmark.
 * Colour comes from the same tokens as the full pose, so it works on the paper theme.
 */
export function NibMini({ size = 20, title, decorative, className }: NibMiniProps) {
  const hidden = decorative ?? title === undefined;
  const style = { '--nib-sw': Math.round(Math.max(2.25, 40 / size) * 100) / 100, '--nib-w': `${size / 16}rem`, '--nib-h': `${size / 16}rem` } as CSSProperties;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="66 26 98 98"
      width={size}
      height={size}
      className={`nib${className ? ` ${className}` : ''}`}
      style={style}
      data-pose="mini"
      {...(hidden ? { 'aria-hidden': true, focusable: false } : { role: 'img', 'aria-label': title })}
    >
      <S d="M104 55 C121 54 134 67 133 85 C132 102 118 114 102 113 C85 112 74 99 75 83 C76 67 89 56 104 55 Z" />
      <Cap />
      <Eye mode="open" />
      <Beak mode="closed" />
    </svg>
  );
}
