import type { CSSProperties } from 'react';
import './mascot.css';
import { L, S } from './parts';

export interface NibClimberProps {
  /** Rendered width at the base scale, in px (drawn as rem). Height is 1.8x. Default 52. */
  size?: number;
  className?: string;
}

/**
 * Nib on a rope, seen from the front, in the same hand-drawn style as the full
 * poses (misregistered fill, one dark outline). The rope runs down x=35 of the
 * 70x126 box, behind the bird: both wings reach up and curl over it, the feet
 * grip it below. Decorative.
 *
 * The climb is CSS: while the page scrolls, the Rope sets `data-climb="down"`
 * (or `"up"`) on the marker that holds this art, and the wings pull in turn
 * while the feet shuffle, hand over hand. At rest it hangs still. Reduced
 * motion keeps the static pose.
 */
export function NibClimber({ size = 52, className }: NibClimberProps) {
  const style = {
    '--nib-sw': 3.4,
    '--nib-w': `${size / 16}rem`,
    '--nib-h': `${(size * 1.8) / 16}rem`,
  } as CSSProperties;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 70 126"
      width={size}
      height={Math.round(size * 1.8)}
      aria-hidden="true"
      focusable="false"
      className={`nib nib-climber${className ? ` ${className}` : ''}`}
      style={style}
      data-pose="climb"
    >
      {/* wings: reach up and curl over the rope. Drawn first so the head sits in front. */}
      <g className="nib-climb-arm nib-climb-arm-a">
        <S d="M26 72 C9 62 6 36 28 14 C32 9 37 13 34 18 C22 34 26 54 31 66 Z" />
      </g>
      <g className="nib-climb-arm nib-climb-arm-b">
        <S d="M44 74 C63 66 64 44 42 27 C38 23 34 27 37 31 C49 44 44 58 40 68 Z" />
      </g>
      {/* tail, behind the body */}
      <S d="M33 102 C27 110 24 117 22 124 C29 122 35 116 38 107 Z" />
      <g className="nib-climb-body">
        {/* body and scarf */}
        <S d="M35 60 C23 63 19 78 21 90 C23 102 29 108 35 108 C42 108 48 102 49 90 C51 77 46 63 35 60 Z" />
        <S d="M23 63 C30 69 42 69 48 63 L49 69 C42 75 29 75 22 69 Z" />
        {/* head, cap, eye, beak */}
        <S d="M35 33 C45 33 51 40 50 49 C49 57 42 61 35 61 C27 61 21 55 21 47 C21 39 27 33 35 33 Z" />
        <S d="M21 46 C20 34 28 28 36 29 C45 29 51 36 50 45 C43 42 29 42 21 46 Z" />
        <L d="M27 33 L26 42 M35 30 L35 41 M43 32 L44 42" />
        <S c="b" d="M32 26 C36 24 40 27 38 30.5 C35 32 31 30 32 26 Z" />
        <ellipse className="e" cx="41" cy="49" rx="3.8" ry="4" />
        <circle className="p" cx="42.2" cy="49.4" r="1.9" />
        <S c="b" d="M49 47 C53 48 56 50 58 54 C54 55 51 55 49 53 Z" />
      </g>
      {/* feet, gripping below */}
      <g className="nib-climb-foot nib-climb-foot-a">
        <L d="M30 107 L30 114 L35 116 M30 114 L28 118" />
      </g>
      <g className="nib-climb-foot nib-climb-foot-b">
        <L d="M40 107 L40 112 L35 114 M40 112 L42 116" />
      </g>
    </svg>
  );
}
