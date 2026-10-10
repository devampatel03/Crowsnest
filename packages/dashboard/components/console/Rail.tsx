'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Compass, Package, ScrollText, Users, type LucideIcon } from 'lucide-react';
import { NibMini } from '@/components/mascot';
import { Wordmark } from '@/components/system';
import { cn } from '@/lib/format';
import { useConsoleLive } from './ConsoleLiveProvider';
import { RailLantern } from './RailLantern';

export const CONSOLE_PAGES = [
  { href: '/horizon', name: 'Horizon', about: 'What needs your attention' },
  { href: '/lookout', name: 'Lookout', about: 'Who maintains your packages' },
  { href: '/hold', name: 'Installed', about: 'What is installed' },
  { href: '/log', name: 'Log', about: 'Everything Crowsnest has called' },
] as const;

const ICONS: Record<string, LucideIcon> = { '/horizon': Compass, '/lookout': Users, '/hold': Package, '/log': ScrollText };

export function pageFor(pathname: string) {
  return CONSOLE_PAGES.find((p) => pathname === p.href || pathname.startsWith(`${p.href}/`));
}

const VERSION = process.env.NEXT_PUBLIC_BUILD || '0.1.0';

/**
 * Fixed rail: an icon over the page name, centred, with the active page on a
 * yellow sketch tile. It never expands, so nothing is clipped; what each page
 * is for is the page title and note. Below 768 it is a bottom tab bar.
 */
export function Rail() {
  const pathname = usePathname();
  const live = useConsoleLive();
  const lit = live.status === 'live';
  const footText = lit ? 'Connected. Crowsnest is live.' : 'Disconnected. Crowsnest is offline.';

  return (
    <div className="relative z-30 w-rail shrink-0 max-md:w-0">
      <nav
        aria-label="Console"
        className={cn(
          'fixed inset-y-0 left-0 flex w-rail flex-col border-r border-rule bg-raised',
          'max-md:inset-x-0 max-md:bottom-0 max-md:top-auto max-md:h-16 max-md:w-full max-md:flex-row max-md:border-r-0 max-md:border-t',
        )}
      >
        <Link href="/" aria-label="Crowsnest home" className="flex h-console-header shrink-0 items-center justify-center max-md:hidden">
          <Wordmark glyphOnly glyph={<NibMini size={22} />} />
        </Link>

        <ul className="m-0 flex list-none flex-col gap-s2 px-s2 pt-s3 max-md:w-full max-md:flex-row max-md:gap-0 max-md:p-0">
          {CONSOLE_PAGES.map((p) => {
            const active = pageFor(pathname)?.href === p.href;
            return (
              <li key={p.href} className="max-md:flex-1">
                <Link
                  href={p.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative flex flex-col items-center justify-center gap-1 rounded-ctl px-1 py-s2 text-center font-sans text-[0.75rem] font-medium leading-tight no-underline transition-colors duration-ui',
                    'max-md:h-16 max-md:rounded-none',
                    active ? 'bg-cta text-nib-line' : 'text-fg-soft hover:bg-pressed hover:text-fg',
                  )}
                >
                  {(() => {
                    const Icon = ICONS[p.href];
                    return <Icon size={20} strokeWidth={1.75} aria-hidden="true" />;
                  })()}
                  <span>{p.name}</span>
                  <span className="sr-only">. {p.about}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mt-auto flex flex-col items-center gap-s1 border-t border-rule px-s2 py-s3 max-md:hidden">
          <span role="img" aria-label={footText} title={footText} data-live-status={live.status} className="flex min-h-11 items-center">
            <RailLantern lit={lit} />
          </span>
          <Link href="/docs" className="label flex min-h-9 items-center whitespace-nowrap text-fg-mute hover:text-fg">
            Docs ↗
          </Link>
          <p className="m-0 whitespace-nowrap text-[0.6875rem] text-fg-mute">v{VERSION}</p>
        </div>
      </nav>
    </div>
  );
}
