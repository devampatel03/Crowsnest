'use client';

import { Nib } from '@/components/mascot';
import { GLOBAL_ERROR } from '@/lib/content/nib';

// Replaces the root layout, so globals.css and the fonts are not guaranteed.
// Deep tokens are inlined; no Tailwind classes here. The mascot's own
// stylesheet carries token fallbacks, so Nib still draws.
export default function GlobalError() {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#F7F1E3', color: '#1A1608', fontFamily: 'system-ui, sans-serif', lineHeight: 1.6 }}>
        <main style={{ maxWidth: 1120, margin: '0 auto', padding: '84px 20px', display: 'flex', flexWrap: 'wrap', gap: 32, alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 320px' }}>
            <h1 style={{ margin: 0, fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: 44, lineHeight: 1.05 }}>{GLOBAL_ERROR.title}</h1>
            <p style={{ maxWidth: '66ch', color: '#453F2C', fontSize: 18 }}>{GLOBAL_ERROR.body}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                height: 44,
                padding: '0 20px',
                background: '#F7C948',
                color: '#1A1608',
                border: 0,
                borderRadius: 6,
                fontSize: 15,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Reload →
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <p
              style={{
                margin: '0 0 12px',
                padding: '8px 14px',
                border: '1.5px solid #8A8266',
                borderRadius: 10,
                background: '#FFFBF0',
                color: '#1A1608',
                fontFamily: 'ui-rounded, cursive',
                fontSize: 21,
                lineHeight: 1.25,
              }}
            >
              {GLOBAL_ERROR.bubble}
            </p>
            <Nib pose="oops" size={160} />
          </div>
        </main>
      </body>
    </html>
  );
}
