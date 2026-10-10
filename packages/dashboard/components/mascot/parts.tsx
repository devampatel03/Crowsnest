import type { ReactNode } from 'react';

/**
 * Shared drawing parts for Nib. Everything here returns SVG fragments in the
 * shared 200x240 pose space (ground line y=224). Colours come from classes in
 * mascot.css, never from literals, so the dark surface and Fog both work.
 *
 * Misregistered fill: every filled shape draws its fill 2px down-right of its
 * outline, like a badly aligned print. That offset is the style.
 */

export type ShapeClass = 'f' | 'b' | 'e';

/** Filled shape: offset fill under a single hand-nudged outline. */
export function S({ d, c = 'f', line = '' }: { d: string; c?: ShapeClass; line?: string }) {
  return (
    <>
      <path className={c} d={d} transform="translate(2 2)" />
      <path className={`l ${line}`.trim()} d={d} />
    </>
  );
}

/** Open stroke only. */
export function L({ d, line = '' }: { d: string; line?: string }) {
  return <path className={`l ${line}`.trim()} d={d} />;
}

export type EyeMode = 'open' | 'narrow' | 'closed' | 'wide' | 'side';
export type BrowMode = 'level' | 'down' | 'up' | 'worry' | 'none';
export type BeakMode = 'closed' | 'open';

const BROWS: Record<Exclude<BrowMode, 'none'>, string> = {
  level: 'M106 76 Q113 74.5 121 76',
  down: 'M105 72 Q113 74 122 80',
  up: 'M106 77.5 Q113 70 121.5 73',
  worry: 'M105 78 Q112 76 121 71',
};

export function Eye({ mode }: { mode: EyeMode }) {
  if (mode === 'closed') return <L d="M106.5 88 Q113 94 120.5 87.5" />;
  const ry = mode === 'narrow' ? 3.4 : mode === 'wide' ? 7.6 : 6.5;
  const rx = mode === 'wide' ? 7.6 : 6.5;
  const px = mode === 'side' ? 111 : 115;
  return (
    <g className="nib-eyes">
      <ellipse className="e" cx="113" cy="87" rx={rx} ry={ry} />
      <circle className="p" cx={px} cy="87.4" r={mode === 'narrow' ? 2.3 : 3.2} />
      <circle className="e" cx={px + 1.6} cy="86" r="1.1" />
    </g>
  );
}

export function Brow({ mode }: { mode: BrowMode }) {
  return mode === 'none' ? null : <L d={BROWS[mode]} />;
}

/** The nib-shaped beak: a triangle with a slit. Open splits into two mandibles. */
export function Beak({ mode }: { mode: BeakMode }) {
  if (mode === 'open') {
    return (
      <>
        <S c="b" d="M129 78 C140 79 150 85 157 93 L131 91 Z" />
        <S c="b" d="M131.5 94 L152 100 C146 106 137 105 130 100 Z" />
      </>
    );
  }
  return (
    <>
      <S c="b" d="M129 79 C140 80.5 150 88 157 98.5 C147 100 137 98.5 130 96 Z" />
      <L d="M134 88.5 Q145 92 154.5 97" />
    </>
  );
}

/** Knit cap with a bobble. `droop` lets the bobble hang to the side. */
export function Cap({ droop = false }: { droop?: boolean }) {
  return (
    <>
      <S d="M75 80 C74 58 90 44 107 45.5 C123 46 134 60 133 78 C120 73 92 74 75 80 Z" />
      <L d="M90 59 L88.5 74 M102 53 L101.5 72 M115 54 L116 73" />
      <g className="nib-bobble">
        {droop ? (
          <>
            <L d="M98 47 C90 44 80 46 74 56" />
            <S c="b" d="M74 51.5 C79 51 82 55 80 59.5 C76 62 71 59 72 55 Z" />
          </>
        ) : (
          <S c="b" d="M106 34 C112 33 114 39 111 44 C106 47 100 43 101 38 Z" />
        )}
      </g>
    </>
  );
}

export function Scarf() {
  return (
    <>
      <S d="M77 107 C92 118 119 121 135 108 L137 120 C120 132 92 130 76 120 Z" />
      <L d="M88 114 L90 127 M101 118 L102 130 M115 118 L115 129" line="mute" />
      <S d="M116 125 C120 134 120 144 118 152 L126 150 C128 140 128 130 126 122 Z" />
    </>
  );
}

/** Egg body, heavy at the bottom. */
export function Body() {
  return (
    <g className="nib-body">
      <S d="M92 113 C66 120 55 150 57 177 C59 203 80 214 102 214 C127 214 143 200 143 174 C143 146 127 118 100 112.5 Z" />
    </g>
  );
}

export function Tail() {
  return (
    <g className="nib-tail">
      <S d="M64 185 C50 176 32 176 21 182 C33 189 50 193 66 196 Z" />
      <S d="M62 196 C48 197 31 202 21 211 C35 213 52 209 66 205 Z" />
      <S d="M66 204 C56 211 44 219 38 226 C50 226 62 220 72 211 Z" />
    </g>
  );
}

export function Feet({ x = 0 }: { x?: number }) {
  const d = `M${88 + x} 213 L${86 + x} 222 L${77 + x} 224.5 M${86 + x} 222 L${93 + x} 225 M${112 + x} 213 L${111 + x} 222 L${102 + x} 224.5 M${111 + x} 222 L${118 + x} 225`;
  return <L d={d} />;
}

/** The spar Nib sits on. */
export function Spar() {
  return (
    <>
      <S d="M16 227 C60 224 140 225.5 184 227.5 L184 236 C140 237.5 60 236 16 236 Z" />
      <L d="M30 231.5 H44 M152 232 H166" line="mute" />
    </>
  );
}

export function WingDown() {
  return (
    <g className="nib-wing">
      <S d="M104 129 C129 135 134 170 113 191 C101 199 84 189 82 171 C82 150 90 134 104 129 Z" />
      <L d="M98 152 C104 166 104 176 100 186 M112 150 C116 162 114 172 110 182" />
    </g>
  );
}

/** Wing lifted. 'out' and 'cap' are drawn behind the head; 'hold' steadies a spyglass in front. */
export function WingUp({ tip = 'out' }: { tip?: 'out' | 'cap' | 'hold' }) {
  const d = {
    out: 'M108 128 C132 134 156 126 166 104 C172 90 174 72 172 56 C160 66 152 82 148 96 C140 112 118 112 108 128 Z',
    cap: 'M108 128 C134 134 158 122 164 98 C166 80 156 60 142 46 C140 58 140 72 138 86 C132 106 112 112 108 128 Z',
    hold: 'M104 130 C122 135 138 125 143 106 C138 99 128 101 120 109 C108 113 98 121 104 130 Z',
  }[tip];
  return (
    <g className="nib-wing">
      <S d={d} />
      {tip === 'hold' ? null : <L d="M140 112 C150 104 158 92 162 80 M128 116 C140 112 148 106 152 98" />}
    </g>
  );
}

/** Spyglass in local coords: eyepiece at 0, objective at ~50. `lit` strokes the lens in beam. */
export function Glass({ x, y, rot, lit = false }: { x: number; y: number; rot: number; lit?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <g className="nib-glass">
        <S d="M0 -4 H15 V4.5 H0 Z" />
        <S d="M15 -5.5 H33 V6 H15 Z" />
        <S d="M33 -8.5 L50 -9.5 V10.5 L33 9 Z" />
        <L d="M26 -5.5 V6" />
        <path className={lit ? 'l beam' : 'l'} d="M52 -7 Q55.5 0.5 52 8" />
        {lit ? <path className="l beam" d="M57 -4 L63 -6 M58 1 H65 M57 6 L63 8" /> : null}
      </g>
    </g>
  );
}

/** Bell on a cord. `swing` marks are hold-coloured and only used in `ring`. */
export function Bell({ x, y, marks = false, hold = false }: { x: number; y: number; marks?: boolean; hold?: boolean }) {
  const t = hold ? 'l hold' : 'l';
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className="nib-bell">
        <L d="M0 -26 V-12" line="mute" />
        <path className="f" d="M-15 17 C-14 4 -9 -11 0 -12 C9 -11 14 4 15 17 Z" transform="translate(2 2)" />
        <path className={t} d="M-15 16.5 C-14.5 3.5 -9 -11 0.5 -12 C9 -11.5 14 4 15.5 17 C7 18.5 -6 18 -15 16.5 Z" />
        <circle className="b" cx="1" cy="22" r="3.4" />
        {marks ? <path className={t} d="M-25 -2 Q-29 6 -26 14 M25 -1 Q30 6 27 15 M-33 3 Q-36 8 -34 13 M33 4 Q37 8 35 13" /> : null}
      </g>
    </g>
  );
}

export function Lantern({ x, y, lit = true }: { x: number; y: number; lit?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className="nib-lantern">
        <L d="M-6 -4 Q0 -14 6 -4" />
        <S d="M-9 -4 H9 V4 H-9 Z" />
        <S d="M-8 4 H8 L10 22 H-10 Z" />
        <S d="M-10 22 H10 V26 H-10 Z" />
        {lit ? <path className="beam fl" d="M0 8 C4 12 4 17 0 20 C-4 17 -4 12 0 8 Z" /> : null}
      </g>
    </g>
  );
}

export function Group({ children, className }: { children: ReactNode; className?: string }) {
  return <g className={className}>{children}</g>;
}
