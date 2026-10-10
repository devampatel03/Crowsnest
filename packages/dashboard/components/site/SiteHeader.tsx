'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Button } from '@/components/system/Button';
import { Wordmark } from '@/components/system/Wordmark';
import { cn } from '@/lib/format';
import { INSTALL_HREF, NAV_LINKS, activeSegment } from './nav-items';

/**
 * Sticky header. Links: Docs, Blog, Glossary, GitHub. The right side has
 * `Install`: Secondary on the landing where the hero owns the Primary, Primary
 * everywhere else. Under 768 the links collapse into a Menu sheet (Radix
 * Dialog: focus trap, Esc, inert background).
 */
export function SiteHeader({ glyph }: { glyph?: ReactNode }) {
  const pathname = usePathname() ?? '/';
  const seg = activeSegment(pathname);
  const [open, setOpen] = useState(false);
  const onLanding = pathname === '/';

  const linkClass = (active: boolean) =>
    cn(
      'inline-flex min-h-6 items-center font-sans text-label text-fg-soft no-underline transition-colors duration-ui ease-lookout hover:text-fg',
      active && 'text-fg underline decoration-1 underline-offset-[0.375rem]',
    );

  return (
    <header className="sticky top-0 z-40 h-header border-b border-rule bg-canvas">
      <div className="mx-auto flex h-full max-w-shell items-center justify-between gap-s2 px-s4">
        <Link href="/" aria-current={onLanding ? 'page' : undefined} className="inline-flex min-h-11 items-center no-underline">
          <Wordmark glyph={glyph} />
        </Link>

        <nav aria-label="Primary" className="hidden flex-1 items-center gap-s5 pl-s5 md:flex">
          {NAV_LINKS.map((l) =>
            l.external ? (
              <a key={l.href} href={l.href} rel="noopener" className={linkClass(false)}>
                {l.label} ↗
              </a>
            ) : (
              <Link
                key={l.href}
                href={l.href}
                aria-current={seg === l.href.slice(1) ? 'page' : undefined}
                className={linkClass(seg === l.href.slice(1))}
              >
                {l.label}
              </Link>
            ),
          )}
        </nav>

        <div className="flex items-center gap-s2">
          <div className="hidden md:block">
            <Button variant={onLanding ? 'secondary' : 'primary'} size="sm" href={INSTALL_HREF} arrow={false}>
              Install
            </Button>
          </div>

          <Dialog.Root open={open} onOpenChange={setOpen}>
            <Dialog.Trigger asChild>
              <button type="button" className="btn btn-secondary btn-sm md:hidden">
                Menu
              </button>
            </Dialog.Trigger>
            <Dialog.Content aria-describedby={undefined} className="fixed inset-0 z-50 flex flex-col bg-canvas md:hidden">
              <Dialog.Title className="sr-only">Menu</Dialog.Title>
              <div className="flex h-header shrink-0 items-center justify-between border-b border-rule px-s4">
                <Link href="/" onClick={() => setOpen(false)} className="no-underline">
                  <Wordmark glyph={glyph} />
                </Link>
                <Dialog.Close className="btn btn-secondary btn-sm">Close</Dialog.Close>
              </div>
              <nav aria-label="Primary" className="flex flex-1 flex-col overflow-y-auto">
                {NAV_LINKS.map((l) => {
                  const cls = 'flex h-14 items-center border-b border-rule px-s4 font-sans text-body text-fg no-underline';
                  return l.external ? (
                    <a key={l.href} href={l.href} rel="noopener" className={cls}>
                      {l.label} ↗
                    </a>
                  ) : (
                    <Link
                      key={l.href}
                      href={l.href}
                      onClick={() => setOpen(false)}
                      aria-current={seg === l.href.slice(1) ? 'page' : undefined}
                      className={cls}
                    >
                      {l.label}
                    </Link>
                  );
                })}
                <div className="p-s4">
                  <Button
                    variant={onLanding ? 'secondary' : 'primary'}
                    href={INSTALL_HREF}
                    onClick={() => setOpen(false)}
                    className="w-full"
                  >
                    Install
                  </Button>
                </div>
              </nav>
            </Dialog.Content>
          </Dialog.Root>
        </div>
      </div>
    </header>
  );
}
