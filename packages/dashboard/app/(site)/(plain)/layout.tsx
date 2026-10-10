import type { ReactNode } from 'react';
import { SiteFrame } from '@/components/site/SiteFrame';

// Landing, About and Privacy: always Deep, never read the theme cookie, so
// these routes stay static.
export default function PlainLayout({ children }: { children: ReactNode }) {
  return <SiteFrame>{children}</SiteFrame>;
}
