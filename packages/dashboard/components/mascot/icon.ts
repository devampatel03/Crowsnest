/**
 * Favicon / app icon data for Nib's head. Standalone SVG with literal colours
 * (icons cannot read CSS variables), so the site builder can use it in
 * `app/icon.tsx` (ImageResponse) or serve it as `app/icon.svg` unchanged.
 *
 * Usage in app/icon.tsx: render `<img src={nibIconDataUri()} />` inside an
 * ImageResponse, or return `new Response(nibIconSvg(), { headers: { 'content-type': 'image/svg+xml' } })`.
 */

export const NIB_ICON_VIEWBOX = '66 26 98 98';

/** Icon palette (matches --nib-ink and --nib-fill; the beak is the amber accent; the tile is cream). */
export const NIB_ICON_COLORS = {
  line: '#1a1608',
  fill: '#f2c53d',
  eye: '#fffaf0',
  pupil: '#1a1608',
  beak: '#d98a14',
  background: '#f7f1e3',
} as const;

const HEAD = 'M104 55 C121 54 134 67 133 85 C132 102 118 114 102 113 C85 112 74 99 75 83 C76 67 89 56 104 55 Z';
const CAP = 'M75 80 C74 58 90 44 107 45.5 C123 46 134 60 133 78 C120 73 92 74 75 80 Z';
const BEAK = 'M129 79 C140 80.5 150 88 157 98.5 C147 100 137 98.5 130 96 Z';
const BOBBLE = 'M106 34 C112 33 114 39 111 44 C106 47 100 43 101 38 Z';

/** The icon as an SVG string. `rounded` adds the background tile (apple icon); omit for a transparent favicon. */
export function nibIconSvg({ rounded = true, colors = NIB_ICON_COLORS }: { rounded?: boolean; colors?: typeof NIB_ICON_COLORS } = {}): string {
  const c = colors;
  const sw = 6;
  const line = `fill="none" stroke="${c.line}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"`;
  const shape = (d: string, fill: string) => `<path d="${d}" fill="${fill}" transform="translate(2 2)"/><path d="${d}" ${line}/>`;
  const bg = rounded ? `<rect x="60" y="20" width="110" height="110" rx="24" fill="${c.background}"/>` : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="60 20 110 110" width="32" height="32">${bg}` +
    shape(HEAD, c.fill) +
    shape(CAP, c.fill) +
    shape(BOBBLE, c.beak) +
    `<ellipse cx="113" cy="87" rx="7" ry="7" fill="${c.eye}"/><circle cx="115" cy="87.4" r="3.4" fill="${c.pupil}"/>` +
    shape(BEAK, c.beak) +
    `</svg>`
  );
}

export function nibIconDataUri(options?: Parameters<typeof nibIconSvg>[0]): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(nibIconSvg(options))}`;
}
