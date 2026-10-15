import { ImageResponse } from 'next/og';
import { nibIconDataUri } from '@/components/mascot/icon';

export const size = { width: 64, height: 64 };
export const contentType = 'image/png';

// Nib's head on a rounded cream tile (components/mascot/icon.ts, literal colours).
export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={nibIconDataUri({ rounded: true })} width={64} height={64} alt="" />
      </div>
    ),
    size,
  );
}
