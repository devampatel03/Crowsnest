import { ogImage, OG_SIZE, OG_TYPE } from '@/lib/og/render';

export const alt = 'Crowsnest. A lookout for what you install. Nib the crow keeps watch.';
export const size = OG_SIZE;
export const contentType = OG_TYPE;

export default function Image() {
  return ogImage({ title: 'A lookout for what you install.', big: true });
}
