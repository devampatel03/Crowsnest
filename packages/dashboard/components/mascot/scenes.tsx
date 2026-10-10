import type { ReactNode } from 'react';
import { L, S, Lantern } from './parts';
import { Crow, POSE_ART, type NibPose } from './poses';

/**
 * Comic panel scenes. Every panel is a 400x300 SVG; captions are real text
 * outside the SVG. Crates are fictional sample packages; their stencilled
 * names are drawn as marks and named in the alt text instead.
 */

/** A hand-wobbled panel frame. pathLength=1 so CSS can draw it on. */
export function PanelFrame({ heavy = false }: { heavy?: boolean }) {
  return (
    <path
      className={heavy ? 'frame heavy' : 'frame'}
      pathLength={1}
      d="M7 9 C100 5 300 10 393 6 C397 90 394 210 393 293 C300 297 100 292 8 295 C4 200 9 100 7 9 Z"
    />
  );
}

export function PanelSvg({ children, heavy }: { children: ReactNode; heavy?: boolean }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" className="nib-panel" aria-hidden="true" focusable="false">
      <PanelFrame heavy={heavy} />
      {children}
    </svg>
  );
}

/** Nib placed in a panel. x,y = top-left of the 200x240 pose box. */
export function Placed({ pose, x, y, s }: { pose: NibPose; x: number; y: number; s: number }) {
  const Art = POSE_ART[pose];
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <Art />
    </g>
  );
}

/** A crate. `mark` draws the stencil as dashes; `crown`/`moustache` are the gag. */
export function Crate({ x, y, w = 56, h = 44, mark = 3, extra }: { x: number; y: number; w?: number; h?: number; mark?: number; extra?: ReactNode }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <S d={`M0 1 L${w} 0 L${w + 1} ${h} L-1 ${h - 1} Z`} />
      <L d={`M2 ${h * 0.32} H${w - 2} M2 ${h * 0.68} H${w - 2}`} line="mute" />
      <L d={`M${w * 0.2} ${h * 0.5} h${mark * 5} M${w * 0.2 + mark * 5 + 5} ${h * 0.5} h8`} />
      {extra}
    </g>
  );
}

export function Scene1() {
  return (
    <>
      <L d="M44 22 V256" />
      <L d="M44 46 H196" />
      <L d="M26 262 C120 258 300 264 376 260" line="ground" />
      <Placed pose="perch" x={26} y={4} s={0.8} />
      <g transform="translate(200 66) scale(1.2)">
        <Lantern x={0} y={0} />
      </g>
      <L d="M196 46 Q200 52 200 56" line="mute" />
      <Crate x={96} y={212} w={64} h={50} />
      <Crate x={186} y={212} w={64} h={50} />
      <Crate x={276} y={212} w={64} h={50} extra={<L d="M16 -8 L24 -17 M32 -8 V-19 M48 -8 L40 -17" line="beam" />} />
    </>
  );
}

export function Scene2() {
  return (
    <>
      <L d="M20 262 C120 258 280 264 380 260" line="ground" />
      <Crate x={46} y={140} w={130} h={110} mark={6} extra={<L d="M42 -3 L48 -26 L62 -12 L76 -28 L88 -3 Z" />} />
      <Crate x={224} y={160} w={130} h={92} mark={6} extra={<L d="M26 42 C38 34 52 40 66 46 C80 40 94 34 106 42 C98 52 84 52 66 50 C48 52 34 52 26 42 Z" />} />
      <circle className="e" cx="262" cy="196" r="4" /><circle className="e" cx="318" cy="196" r="4" />
    </>
  );
}

export function Scene3() {
  return (
    <>
      <Placed pose="spy" x={0} y={44} s={0.88} />
      <L d="M196 100 C206 96 214 92 222 86" line="beam" />
      <circle className="f" cx="300" cy="124" r="80" transform="translate(2 2)" />
      <circle className="l" cx="300" cy="124" r="80" />
      <S d="M252 78 H350 V170 H252 Z" />
      <circle className="e" cx="262" cy="88" r="3" />
      <L d="M268 104 l5 -5 l5 5 l-5 5 z M286 104 H336" />
      <L d="M268 130 a5 5 0 1 0 0.1 0 M284 130 H326" />
      <L d="M266 156 h9 M266 150 h9 M286 154 H334" />
    </>
  );
}

export function Scene4() {
  return (
    <>
      <L d="M20 262 C120 258 280 264 380 260" line="ground" />
      <Placed pose="ring" x={64} y={30} s={1} />
      <g transform="translate(326 218) scale(1.6)">
        <L d="M-28 0 A28 28 0 0 1 28 0" line="mute" />
        <L d="M-20 -4 L-14 -6 M-6 -22 L-4 -16 M12 -16 L16 -22" line="mute" />
        <L d="M0 0 L16 -18" line="hold" />
        <circle className="b" cx="0" cy="0" r="3" />
      </g>
    </>
  );
}

export function Scene5() {
  return (
    <>
      <L d="M20 262 C120 258 280 264 380 260" line="ground" />
      <Placed pose="quiet" x={36} y={30} s={0.8} />
      <S d="M236 190 C300 196 340 196 386 190 C380 218 360 236 330 240 H266 C246 232 238 214 236 190 Z" />
      <L d="M310 190 V104 M310 112 L346 150 H310" line="mute" />
      <Crate x={256} y={152} w={44} h={36} />
      <Crate x={308} y={152} w={44} h={36} />
      <Crate x={148} y={218} w={52} h={40} mark={2} />
      <L d="M174 218 C176 204 168 196 164 192 M164 192 l-10 0 l0 14 l10 0 z" line="mute" />
    </>
  );
}

/** Console strip panels. */
export function FirstRun1() {
  return (
    <>
      <L d="M20 262 C120 258 280 264 380 260" line="ground" />
      <L d="M214 150 H390" line="mute" />
      <L d="M300 144 V156" line="mute" />
      <Placed pose="perch" x={28} y={40} s={0.88} />
    </>
  );
}

export function FirstRun2() {
  return (
    <>
      <L d="M20 262 C120 258 280 264 380 260" line="ground" />
      <g transform="translate(60 40) scale(0.88)">
        <Crow
          front={
            <>
              <S d="M92 150 L150 134 L158 160 L100 178 Z" />
              <ellipse className="l" cx="154" cy="147" rx="5" ry="14" transform="rotate(-16 154 147)" />
              <L d="M104 158 L146 146 M106 168 L140 158" line="mute" />
              <L d="M124 150 L128 176" line="beam" />
            </>
          }
        />
      </g>
      <L d="M232 120 C260 108 300 108 340 120 M240 150 H330" line="mute" />
      <Crate x={262} y={190} w={70} h={56} mark={4} />
    </>
  );
}

export function FirstRun3() {
  return (
    <>
      <L d="M20 262 C120 258 280 264 380 260" line="ground" />
      <L d="M214 150 H390" line="mute" />
      <Placed pose="spy" x={20} y={40} s={0.88} />
      <L d="M200 96 L250 80 M204 104 H262 M200 112 L250 128" line="beam" />
      <Crate x={298} y={112} w={44} h={38} mark={2} />
    </>
  );
}
