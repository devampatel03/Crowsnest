import type { CSSProperties } from 'react';
import './mascot.css';
import { NIB_POSES, POSE_ART, type NibPose } from './poses';

export { NIB_POSES };
export type { NibPose };

export interface NibProps {
  pose: NibPose;
  /** Rendered width at the base scale, in px (drawn as rem). Height follows the 200x240 box. Default 160. */
  size?: number;
  /** Turn on the CSS loops/one-shots for this pose. Reduced motion still shows the static pose. */
  animate?: boolean;
  /** Accessible name. When given, the art is exposed as role="img". */
  title?: string;
  /** Hide from assistive tech. Defaults to true unless a title is given. */
  decorative?: boolean;
  className?: string;
}

/** Stroke width in pose units. Keeps the line at least ~1.6px on screen at small sizes. */
export function strokeFor(size: number): number {
  return Math.round(Math.max(2.25, 320 / size) * 100) / 100;
}

/**
 * Nib, the lookout crow. One component, one props contract; swap the pose
 * art (poses.tsx) for commissioned art without changing any caller.
 */
export function Nib({ pose, size = 160, animate = false, title, decorative, className, ...rest }: NibProps) {
  const Art = POSE_ART[pose];
  const hidden = decorative ?? title === undefined;
  // Sized in rem through --nib-w/--nib-h (see mascot.css; the width/height attributes are the no-CSS fallback), so Nib scales with the interface and layout CSS can still override it.
  const style = { '--nib-sw': strokeFor(size), '--nib-w': `${size / 16}rem`, '--nib-h': `${(size * 1.2) / 16}rem` } as CSSProperties;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 240"
      width={size}
      height={Math.round(size * 1.2)}
      className={`nib${className ? ` ${className}` : ''}`}
      style={style}
      data-pose={pose}
      data-ambient={animate ? '' : undefined}
      {...(hidden ? { 'aria-hidden': true, focusable: false } : { role: 'img', 'aria-label': title })}
      {...rest}
    >
      <Art />
    </svg>
  );
}
