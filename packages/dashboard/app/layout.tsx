import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Crowsnest — Supply Chain Security',
  description: 'See the storm before it hits your ship',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#020817] text-slate-200 min-h-screen">
        {children}
      </body>
    </html>
  );
}
