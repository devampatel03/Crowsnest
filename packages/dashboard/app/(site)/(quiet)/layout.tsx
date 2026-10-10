import type { ReactNode } from 'react';
import { SiteFrame } from '@/components/site/SiteFrame';

// Privacy: Deep, static, and no Nib lines anywhere on the page, footer
// included (02-copy v3 section 7.2).
export default function QuietLayout({ children }: { children: ReactNode }) {
  return <SiteFrame quiet>{children}</SiteFrame>;
}
