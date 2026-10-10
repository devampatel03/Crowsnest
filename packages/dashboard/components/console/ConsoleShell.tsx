'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { BearingRule, Surface, ToastProvider } from '@/components/system';
import { ConsoleHeader, useLiveStatus } from './ConsoleHeader';
import { ConsoleLiveProvider } from './ConsoleLiveProvider';
import { Rail } from './Rail';
import { ScanDialog } from './ScanDialog';
import { ScanProvider } from './ScanProvider';
import { ShortcutProvider } from './ShortcutProvider';

function Stage({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const live = useLiveStatus();
  const mainRef = useRef<HTMLElement>(null);
  const first = useRef(true);

  // Route change (rail click or `g` chord): move focus to main#page so keyboard and
  // screen reader users start at the new page. Not on first paint.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    mainRef.current?.focus({ preventScroll: false });
  }, [pathname]);

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <ConsoleHeader />
      <div className="mx-auto flex w-full min-w-0 max-w-[110rem] flex-1">
        <BearingRule variant="console" live={{ status: live.status, text: live.text }} className="ml-s3 mt-s4" />
        <main id="page" ref={mainRef} tabIndex={-1} className="min-w-0 flex-1 px-s3 pb-s6 outline-none md:px-s4 max-md:pb-[5.5rem]">
          {children}
        </main>
      </div>
    </div>
  );
}

/**
 * The console shares the one paper theme. Toasts, dialogs and every provider mount INSIDE the surface so its tokens apply to portalled
 * content. Toasts sit past the rail on desktop and above the tab bar on mobile.
 */
export function ConsoleShell({ children }: { children: ReactNode }) {
  return (
    <Surface className="min-h-screen bg-canvas text-fg md:[&_[aria-label=Notifications]]:left-[5.25rem] max-md:[&_[aria-label=Notifications]]:bottom-[4.5rem]">
      <a href="#page" className="skip-link flex min-h-11 min-w-11 items-center">
        Skip to page content
      </a>
      <ToastProvider>
        <ConsoleLiveProvider>
          <ScanProvider>
            <ShortcutProvider>
              <div className="flex min-h-screen">
                <Rail />
                <Stage>{children}</Stage>
              </div>
              <ScanDialog />
            </ShortcutProvider>
          </ScanProvider>
        </ConsoleLiveProvider>
      </ToastProvider>
    </Surface>
  );
}
