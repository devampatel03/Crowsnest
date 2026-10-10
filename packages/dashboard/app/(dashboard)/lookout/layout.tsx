import type { Metadata } from 'next';

// Live console view, not indexable content.
export const metadata: Metadata = {
  title: 'Lookout',
  description: 'Who maintains your packages.',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
