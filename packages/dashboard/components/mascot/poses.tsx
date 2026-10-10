import type { ReactNode } from 'react';
import {
  Beak,
  Bell,
  Body,
  Brow,
  Cap,
  Eye,
  Feet,
  Glass,
  Lantern,
  L,
  S,
  Scarf,
  Spar,
  Tail,
  WingDown,
  WingUp,
  type BeakMode,
  type BrowMode,
  type EyeMode,
} from './parts';

/**
 * The twelve poses, as SVG fragments in the shared 200x240 space. `Nib.tsx`
 * wraps one in an <svg>; comic panels place them with a transform. Each pose
 * is a single component with no props, so commissioned art can replace any one
 * of them without touching callers.
 */

export const NIB_POSES = ['perch', 'spy', 'ring', 'nod', 'squint', 'quiet', 'lost', 'oops', 'lantern', 'haul', 'tilt', 'wave'] as const;
export type NibPose = (typeof NIB_POSES)[number];

interface CrowProps {
  tilt?: number;
  eye?: EyeMode;
  brow?: BrowMode;
  beak?: BeakMode;
  droop?: boolean;
  behind?: ReactNode;
  mid?: ReactNode;
  wing?: ReactNode;
  front?: ReactNode;
  perch?: boolean;
  lean?: number;
  extra?: ReactNode;
  wingBehind?: boolean;
}

export function Crow({
  tilt = 0,
  eye = 'open',
  brow = 'level',
  beak = 'closed',
  droop = false,
  behind,
  mid,
  wing,
  front,
  perch = true,
  lean = 0,
  extra,
  wingBehind = false,
}: CrowProps) {
  return (
    <>
      {perch ? <Spar /> : <L d="M8 226 C60 224 140 227 192 225" />}
      {behind}
      <g transform={lean ? `rotate(${lean} 100 224)` : undefined}>
        <Tail />
        <Body />
        {mid}
        <Scarf />
        {wingBehind ? wing : null}
        <g transform={tilt ? `rotate(${tilt} 104 110)` : undefined}>
          <g className="nib-head">
            <S d="M104 55 C121 54 134 67 133 85 C132 102 118 114 102 113 C85 112 74 99 75 83 C76 67 89 56 104 55 Z" />
            <Cap droop={droop} />
            <Brow mode={brow} />
            <Eye mode={eye} />
            <Beak mode={beak} />
            {extra}
          </g>
        </g>
        {wingBehind ? null : (wing ?? <WingDown />)}
        <Feet />
      </g>
      {front}
    </>
  );
}

export function Perch() {
  return <Crow mid={<Glass x={102} y={178} rot={22} />} />;
}

export function Spy() {
  return <Crow tilt={3} eye="narrow" brow="down" wing={<WingUp tip="hold" />} front={<Glass x={118} y={86} rot={-8} lit />} />;
}

export function Ring() {
  return (
    <Crow
      tilt={-2}
      beak="open"
      eye="wide"
      wingBehind wing={<WingUp tip="out" />}
      behind={
        <>
          <L d="M128 8 H192" />
          <L d="M170 8 V20" line="mute" />
          <Bell x={170} y={46} marks hold />
        </>
      }
    />
  );
}

export function Nod() {
  return (
    <Crow
      tilt={7}
      eye="closed"
      brow="up"
      wingBehind
      wing={<WingUp tip="cap" />}
      front={
        <>
          <S d="M148 178 H186 V214 H148 Z" />
          <L d="M154 172 Q167 164 180 172" line="mute" />
          <L d="M156 196 L164 205 L178 186" line="clear" />
        </>
      }
    />
  );
}

export function Squint() {
  return <Crow tilt={11} eye="narrow" brow="down" front={<Glass x={108} y={158} rot={-42} />} />;
}

export function Quiet() {
  return (
    <Crow
      eye="closed"
      droop
      front={
        <>
          <S d="M114 168 H142 V196 C142 202 138 205 133 205 H123 C118 205 114 202 114 196 Z" />
          <L d="M142 174 C152 174 152 192 141 192" />
          <path className="l steam" d="M121 160 C117 154 125 150 121 144 M131 160 C127 154 135 150 131 144" />
        </>
      }
    />
  );
}

export function Lost() {
  return (
    <Crow
      tilt={-18}
      eye="side"
      brow="up"
      behind={<Glass x={128} y={120} rot={-52} />}
      front={
        <g transform="rotate(180 100 170)">
          <S d="M54 150 L84 154 L118 148 L146 154 V194 L116 190 L84 196 L54 190 Z" />
          <L d="M84 154 V196 M116 148 V190" line="mute" />
          <L d="M64 168 C72 160 80 176 92 168 C100 162 104 176 112 172" />
          <L d="M126 166 L136 178 M136 166 L126 178" />
        </g>
      }
    />
  );
}

export function Oops() {
  return (
    <Crow
      tilt={8}
      eye="side"
      brow="worry"
      extra={<S d="M118 52 C122 36 130 26 140 20 C138 34 132 46 126 56 Z" />}
      front={
        <g transform="rotate(-78 156 206)">
          <Bell x={156} y={206} />
        </g>
      }
    />
  );
}

export function LanternPose() {
  return (
    <Crow
      tilt={4}
      brow="worry"
      front={
        <>
          <L d="M128 186 Q136 172 136 160" line="mute" />
          <g transform="translate(136 158) scale(1.3) translate(-136 -158)"><Lantern x={136} y={158} /></g>
        </>
      }
    />
  );
}

export function Haul() {
  return (
    <Crow
      perch={false}
      lean={9}
      eye="narrow"
      brow="down"
      behind={
        <>
          <S d="M128 172 H190 V224 H128 Z" />
          <L d="M128 190 H190 M128 207 H190 M136 172 V224 M182 172 V224" line="mute" />
          <L d="M128 182 C120 184 114 190 108 200" />
        </>
      }
      front={<L d="M10 120 H30 M6 138 H28 M12 156 H30" line="mute" />}
    />
  );
}

export function Tilt() {
  return (
    <Crow
      tilt={-16}
      brow="up"
      eye="wide"
      behind={
        <>
          <S d="M6 40 C6 24 20 14 36 14 C52 14 64 24 64 38 C64 52 52 60 38 60 L30 72 L28 59 C14 57 6 50 6 40 Z" />
          <L d="M26 33 C26 24 42 24 42 32 C42 39 35 39 35 46 M35 52 V53" />
        </>
      }
    />
  );
}

export function Wave() {
  return <Crow tilt={-3} beak="open" brow="up" wingBehind wing={<WingUp tip="out" />} />;
}

export const POSE_ART: Record<NibPose, () => ReactNode> = {
  perch: Perch,
  spy: Spy,
  ring: Ring,
  nod: Nod,
  squint: Squint,
  quiet: Quiet,
  lost: Lost,
  oops: Oops,
  lantern: LanternPose,
  haul: Haul,
  tilt: Tilt,
  wave: Wave,
};
