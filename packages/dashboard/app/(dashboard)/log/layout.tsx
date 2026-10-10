import type { Metadata } from 'next';

// Live console view, not indexable content.
export const metadata: Metadata = {
  title: 'Log',
  description: 'Everything Crowsnest has called.',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
