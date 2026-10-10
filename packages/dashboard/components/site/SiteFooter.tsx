import Link from 'next/link';
import { Nib } from '@/components/mascot';
import { FOOTER_SIGNOFF } from '@/lib/content/nib';
import { LICENSE_NAME, REPO_URL } from '@/lib/seo/constants';
import { FOOTER_TAGLINE } from '@/lib/seo/entity';

// Three columns as in 02-copy section 2. No newsletter, no social row.

type FooterLink = { label: string; href: string; external?: boolean };

const COLUMNS: { heading: string; links: FooterLink[] }[] = [
  {
    heading: 'Product',
    links: [
      { label: 'Install', href: '/#install' },
      { label: 'Docs', href: '/docs' },
      { label: 'Dashboard', href: '/horizon' },
    ],
  },
  {
    heading: 'Learn',
    links: [
      { label: 'Blog', href: '/blog' },
      { label: 'Glossary', href: '/glossary' },
      { label: 'FAQ', href: '/docs/faq' },
    ],
  },
  {
    heading: 'Project',
    links: [
      { label: 'GitHub', href: REPO_URL, external: true },
      { label: 'Contributing', href: '/docs/contributing' },
      { label: 'About', href: '/about' },
      { label: 'Privacy', href: '/privacy' },
    ],
  },
];

const LINK =
  'inline-flex min-h-6 items-center text-body-s text-fg-soft underline-offset-4 hover:text-fg hover:underline max-md:min-h-11';

export function SiteFooter({ lastUpdated, quiet = false }: { lastUpdated?: string; quiet?: boolean }) {
  return (
    <footer>
      <div className="mx-auto max-w-shell px-s4 py-s6">
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-s4 gap-y-s5 md:grid-cols-3">
          {COLUMNS.map((col) => (
            <div key={col.heading}>
              <p className="label m-0 mb-s3">{col.heading}</p>
              <ul className="m-0 flex list-none flex-col gap-s2 p-0">
                {col.links.map((l) => (
                  <li key={`${col.heading}-${l.label}`}>
                    {l.external ? (
                      <a href={l.href} rel="noopener" className={LINK}>
                        {l.label} ↗
                      </a>
                    ) : (
                      <Link href={l.href} rel={l.href === '/horizon' ? 'nofollow' : undefined} className={LINK}>
                        {l.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="mt-s6 flex flex-col gap-s2 border-t border-rule pt-s4">
          {quiet ? null : (
            <div className="flex items-end gap-s3">
              <div aria-hidden="true" className="w-[3rem] shrink-0 [&_svg]:h-auto [&_svg]:w-full">
                <Nib pose="wave" size={48} />
              </div>
              <p className="nib-voice m-0 pb-1 text-fg">{FOOTER_SIGNOFF}</p>
            </div>
          )}
          <p className="m-0 mt-s2 text-body text-fg">{FOOTER_TAGLINE}</p>
          <p className="m-0 text-body-s text-fg-mute">
            Crowsnest · {LICENSE_NAME}
            {lastUpdated ? ` · Updated ${lastUpdated}` : ''}
          </p>
          <p className="m-0 text-body-s text-fg-mute">
            <a href="/llms.txt" className="inline-flex min-h-6 items-center underline-offset-4 hover:underline max-md:min-h-11">
              llms.txt
            </a>
            {' · '}
            <a href="/rss.xml" className="inline-flex min-h-6 items-center underline-offset-4 hover:underline max-md:min-h-11">
              rss.xml
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
