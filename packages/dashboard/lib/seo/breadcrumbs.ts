import type { Crumb } from './types';

// One trail, two consumers: the visible <nav aria-label="Breadcrumb"> and
// BreadcrumbList JSON-LD (jsonld.ts). Both receive the exact same array, so
// the markup always mirrors the page. The docs group (Get started, Use, ...)
// has no URL of its own, so it is not a crumb.

export const SECTION_ROOTS: Record<string, Crumb> = {
  docs: { name: 'Docs', path: '/docs' },
  blog: { name: 'Blog', path: '/blog' },
  glossary: { name: 'Glossary', path: '/glossary' },
};

const HOME: Crumb = { name: 'Crowsnest', path: '/' };

/** Trail for a page, home first, leaf last. */
export function breadcrumbTrail(path: string, leafName: string): Crumb[] {
  const clean = path.replace(/\/+$/, '') || '/';
  if (clean === '/') return [HOME];
  const first = clean.split('/')[1];
  const trail: Crumb[] = [HOME];
  const root = SECTION_ROOTS[first];
  if (root && clean !== root.path) trail.push(root);
  trail.push({ name: leafName, path: clean });
  return trail;
}
