import type { ReactNode } from 'react';
import { NibClimber, NibMini } from '@/components/mascot';
import { BearingRule, type BearingSection } from '@/components/system/BearingRule';

/**
 * Docs shell. DOM order is article, TOC, sidebar so a screen reader or
 * keyboard user reaches the article first (a second skip link jumps to the
 * sidebar). At 1280+ the grid is nav 240 | rule 56 | prose | TOC 200; below
 * 1280 it is one column with the menu first. The rule is decorative here
 * because the TOC beside it carries the real links, so it is inert.
 */
export function DocsShell({
  article,
  toc,
  sidebar,
  sections,
}: {
  article: ReactNode;
  toc: ReactNode;
  sidebar: ReactNode;
  sections: BearingSection[];
}) {
  return (
    <div className="mx-auto flex max-w-docs flex-col px-s4 pb-s6 xl:grid xl:grid-cols-[240px_56px_minmax(0,1fr)_12.5rem] xl:gap-x-s4">
      <div {...({ inert: 'true' } as Record<string, string>)} aria-hidden="true" className="xl:col-start-2 xl:row-start-1">
        <BearingRule
          variant="site"
          sections={sections}
          marker={<NibClimber size={52} />}
          markerCompact={<NibMini size={20} />}
          showLabels={false}
          className="md:hidden xl:block xl:w-14"
        />
      </div>
      <div className="order-2 min-w-0 xl:col-start-3 xl:row-start-1">{article}</div>
      <div className="order-3 xl:sticky xl:top-[4.75rem] xl:col-start-4 xl:row-start-1 xl:self-start xl:pt-s5">{toc}</div>
      <div className="order-1 pt-s3 xl:sticky xl:top-[4.75rem] xl:col-start-1 xl:row-start-1 xl:max-h-[calc(100vh-5.75rem)] xl:self-start xl:overflow-y-auto xl:pt-s5">
        {sidebar}
      </div>
    </div>
  );
}
