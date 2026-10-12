import { Analytics } from '@vercel/analytics/next';
import type { ReactNode } from 'react';
import { NibMini } from '@/components/mascot';
import { JsonLd } from '@/components/seo/JsonLd';
import { Surface } from '@/components/system/Surface';
import { WaveRule } from '@/components/system/WaveRule';
import { siteLastUpdated } from '@/lib/content/routes';
import { organization, website } from '@/lib/seo/jsonld';
import { SiteFooter } from './SiteFooter';
import { SiteHeader } from './SiteHeader';

/**
 * Public shell: skip link, header, main, footer and the sitewide JSON-LD.
 * Vercel Web Analytics is mounted here, not in the root layout, so the console
 * (which people run themselves) never loads it. It sets no cookies; the
 * privacy page says so.
 */
export function SiteFrame({
  children,
  skipToDocsNav = false,
  quiet = false,
}: {
  children: ReactNode;
  skipToDocsNav?: boolean;
  /** No Nib lines in the footer (Privacy). */
  quiet?: boolean;
}) {
  return (
    <Surface className="flex min-h-screen flex-col bg-canvas text-fg">
      <JsonLd data={[organization(), website()]} />
      <a href="#main" className="skip-link inline-flex min-h-11 items-center">
        Skip to content
      </a>
      {skipToDocsNav ? (
        <a href="#docs-navigation" className="skip-link inline-flex min-h-11 items-center" style={{ left: '11.875rem' }}>
          Skip to docs navigation
        </a>
      ) : null}
      <SiteHeader glyph={<NibMini size={22} />} />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <div className="band band-clay pt-s5">
        <div className="mx-auto w-full max-w-shell px-s4">
          <WaveRule id="wave-footer" />
        </div>
        <SiteFooter lastUpdated={siteLastUpdated()} quiet={quiet} />
      </div>
      <Analytics />
    </Surface>
  );
}
