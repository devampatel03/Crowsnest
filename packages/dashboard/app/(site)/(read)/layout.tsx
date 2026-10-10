import type { ReactNode } from 'react';
import { SiteFrame } from '@/components/site/SiteFrame';

// Docs, blog and glossary share the public shell.
export default function ReadLayout({ children }: { children: ReactNode }) {
  return <SiteFrame>{children}</SiteFrame>;
}
