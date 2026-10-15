import { REPO_URL } from '@/lib/seo/constants';

/** Header links: Compare and Console are gone; GitHub is an external text link. */
export const NAV_LINKS = [
  { label: 'Docs', href: '/docs', external: false },
  { label: 'Blog', href: '/blog', external: false },
  { label: 'Glossary', href: '/glossary', external: false },
  { label: 'GitHub', href: REPO_URL, external: true },
] as const;

export const INSTALL_HREF = '/#install';

/** First path segment, used for aria-current on the header links. */
export function activeSegment(pathname: string): string {
  return pathname.split('/')[1] ?? '';
}
