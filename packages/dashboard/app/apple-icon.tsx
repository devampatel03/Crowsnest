import { ImageResponse } from 'next/og';
import { NIB_ICON_COLORS, nibIconDataUri } from '@/components/mascot/icon';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

// Nib's head on a square cream field; iOS rounds the corners itself.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: NIB_ICON_COLORS.background }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={nibIconDataUri({ rounded: false })} width={132} height={132} alt="" />
      </div>
    ),
    size,
  );
}
