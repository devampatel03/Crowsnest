import type { BearingSection } from '@/components/system/BearingRule';
import type { Heading } from '@/lib/content/mdx';

/**
 * Bearing sections from the h2 headings. The degree labels are derived inside
 * BearingRule (evenly around the circle, `index * 360 / count`); nothing here
 * sets one.
 */
export function sectionsFromHeadings(headings: Heading[]): BearingSection[] {
  return headings.filter((h) => h.level === 2).map((h) => ({ id: h.id, title: h.text }));
}
