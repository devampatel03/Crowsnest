import type { Metadata } from 'next';
import { DM_Mono, Instrument_Sans, Instrument_Serif, Patrick_Hand } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { LANDING_DESCRIPTION } from '@/lib/seo/landing';
import { rootMetadata } from '@/lib/seo/metadata';
import { MotionGate } from '@/components/system/MotionGate';
import { SmoothScroll } from '@/components/system/SmoothScroll';
import './globals.css';
import './buttons.css';
import './bands.css';

// Fonts only (brief section 4). The route groups own the shell and the page
// background; the whole platform is one cream paper theme set in globals.css.
// Metadata, JSON-LD and the shell live in the route groups and in lib/seo.
//
// All three are self-hosted by next/font with display: swap. Instrument Sans
// is the variable font (wght 400-700). Instrument Serif has one weight and
// faux bold is forbidden. Tabular numerals are enabled in globals.css.
const instrumentSans = Instrument_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
  fallback: ['system-ui', 'sans-serif'],
});

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-display',
  display: 'swap',
  fallback: ['Georgia', 'Times New Roman', 'serif'],
});

const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
  fallback: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
});

// Patrick Hand (400 only): Nib's handwriting voice. Comic captions, speech
// bubbles, Nib's note and sign-offs; never nav, buttons, tables or headings.
const patrickHand = Patrick_Hand({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-hand',
  display: 'swap',
  fallback: ['ui-rounded', 'cursive'],
});

// metadataBase, the RSS alternate and the sitewide defaults (04-seo-contract).
// Pages supply absolute titles through buildMetadata, so there is no title.template.
// Sitewide JSON-LD (Organization, WebSite) lives in the (site) layout so console
// pages carry none. Console segment layouts override `robots` with noindex.
export const metadata: Metadata = rootMetadata(LANDING_DESCRIPTION);

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${instrumentSans.variable} ${instrumentSerif.variable} ${dmMono.variable} ${patrickHand.variable}`}>
      <body className="min-h-screen bg-canvas font-sans text-fg antialiased">
        <MotionGate />
        <SmoothScroll />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
