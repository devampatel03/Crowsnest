import '@/components/mascot/mascot.css';
import { Bell, L, S } from '@/components/mascot/parts';
import { Crate, Placed } from '@/components/mascot/scenes';
import { POST_COVERS, type CoverKind } from '@/lib/content/nib';

const FRAME = 'M7 9 C100 5 300 10 393 6 C397 70 394 150 393 213 C300 217 100 212 8 215 C4 140 9 70 7 9 Z';

/** One drawn scene per kind, in a 400x220 box: Nib on the left, the post's object on the right. */
function Scene({ kind }: { kind: CoverKind }) {
  switch (kind) {
    case 'slopsquat':
      return (
        <>
          <Placed pose="tilt" x={14} y={8} s={0.85} />
          <Crate x={226} y={112} w={110} h={86} mark={5} extra={<L d="M42 12 c0-12 24-12 24 0 c0 8-12 8-12 18 M54 38 v2" line="beam" />} />
          <S d="M218 60 L318 54 L322 86 L222 92 Z" c="b" />
          <text x="236" y="80" fontFamily="var(--font-hand), ui-rounded, cursive" fontSize="22" className="p">
            made up
          </text>
          <L d="M270 98 V112" line="mute" />
        </>
      );
    case 'checklist':
      return (
        <>
          <Placed pose="perch" x={14} y={8} s={0.85} />
          <S d="M214 24 H350 V204 H214 Z" />
          <S d="M262 16 H302 V34 H262 Z" c="b" />
          {[0, 1, 2, 3, 4].map((i) => (
            <g key={i} transform={`translate(0 ${i * 32})`}>
              <L d="M228 54 h18 v18 h-18 z" />
              <L d="M231 63 l5 5 l9 -11" line="clear" />
              <L d="M256 64 H334" line="mute" />
            </g>
          ))}
        </>
      );
    case 'dock':
      return (
        <>
          <L d="M14 204 C100 200 300 208 386 203" line="ground" />
          <Placed pose="perch" x={8} y={8} s={0.85} />
          <L d="M226 14 H300" />
          <Bell x={262} y={54} />
          <Crate x={286} y={150} w={80} h={54} mark={4} />
        </>
      );
    case 'flag':
      return (
        <>
          <L d="M14 204 C100 200 300 208 386 203" line="ground" />
          <Placed pose="wave" x={14} y={8} s={0.85} />
          <L d="M276 204 V56" />
          <S d="M276 56 L346 76 L276 102 Z" c="b" />
          <L d="M246 204 h60 l-8 -14 h-44 z" line="mute" />
        </>
      );
  }
}

/**
 * Blog cover: a single-frame comic in the mascot's chalk-line style. Real
 * alt text from the copy deck (`decorative` hides it in the index row, where
 * the post title already names the post).
 */
export function BlogCover({ slug, decorative = false, className }: { slug: string; decorative?: boolean; className?: string }) {
  const c = POST_COVERS[slug];
  if (!c) return null;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 400 220"
      width={400}
      height={220}
      className={`nib-panel${className ? ` ${className}` : ''}`}
      {...(decorative ? { 'aria-hidden': true, focusable: false } : { role: 'img', 'aria-label': c.alt })}
    >
      <path className="frame" d={FRAME} />
      <Scene kind={c.kind} />
    </svg>
  );
}
