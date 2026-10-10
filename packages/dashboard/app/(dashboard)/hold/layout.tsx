import type { Metadata } from 'next';

// Live console view, not indexable content.
export const metadata: Metadata = {
  title: 'Installed',
  description: 'What is installed.',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
