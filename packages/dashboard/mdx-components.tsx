import type { MDXComponents } from 'mdx/types';
import { mdxComponents } from '@/components/mdx';

// Required by the Next.js MDX convention; this site renders content with
// @mdx-js/mdx `evaluate` (lib/content/mdx.ts) and passes the same map directly.
export function useMDXComponents(): MDXComponents {
  return mdxComponents as unknown as MDXComponents;
}
