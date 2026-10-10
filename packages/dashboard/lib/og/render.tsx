import { ImageResponse } from 'next/og';
import { nibIconDataUri } from '@/components/mascot/icon';

// Shared OG card on cream paper. ImageResponse cannot read CSS variables, so the
// raw Paper tokens are inlined. No font files are vendored, so the
// card uses the renderer's default sans (the live site uses Instrument Serif).
export const OG_SIZE = { width: 1200, height: 630 };
export const OG_TYPE = 'image/png';

const PAPER = '#F7F1E3';
const TX = '#1A1608';
const MUTE = '#5C5642';
const BEAM = '#B8860B';
const LINE = '#D9CDAE';

/**
 * `big` is the root card: Nib's head large beside the title. Section cards
 * carry a small head next to the wordmark. The head is the favicon art
 * (literal colours); the full poses rely on CSS variables that this renderer
 * cannot read.
 */
export function ogImage({ title, section, big = false }: { title: string; section?: string; big?: boolean }) {
  const size = big ? (title.length > 36 ? 64 : 80) : title.length > 60 ? 56 : title.length > 36 ? 72 : 92;
  const head = nibIconDataUri({ rounded: false });
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          background: PAPER,
          color: TX,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 34, color: TX }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={head} width={44} height={44} alt="" style={{ marginRight: 14 }} />
          {'Crowsnest.'}
          {section ? <span style={{ marginLeft: 18, fontSize: 24, color: MUTE }}>{section}</span> : null}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', fontSize: size, lineHeight: 1.05, letterSpacing: -2, maxWidth: big ? 700 : 1000 }}>{title}</div>
          {big ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={head} width={300} height={300} alt="" />
          ) : null}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', height: 1, background: LINE, width: '100%' }} />
          <div style={{ display: 'flex', marginTop: 22, fontSize: 26, color: MUTE }}>A lookout for the packages you install.</div>
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
