import Link from 'next/link';
import type { DocEntry } from '@/lib/content/loader';
import { DOC_GROUP_ORDER } from '@/lib/content/loader';
import { cn } from '@/lib/format';
import { Disclosure } from './Disclosure';

function NavLink({ href, current, children }: { href: string; current: boolean; children: string }) {
  return (
    <Link
      href={href}
      aria-current={current ? 'page' : undefined}
      className={cn(
        'inline-flex min-h-6 w-full items-center border-l-2 py-0.5 pl-s3 text-body-s no-underline underline-offset-4 hover:text-fg hover:underline max-md:min-h-11',
        current ? 'border-brand text-fg' : 'border-transparent text-fg-soft',
      )}
    >
      {children}
    </Link>
  );
}

/**
 * Docs sidebar: groups from frontmatter `section` in the brief's order. The
 * current item is `--c-fg` with a 2px brand left bar. Integrations is a
 * heading, not a page. Below 1280 it sits behind a "Docs menu" disclosure.
 */
export function DocsSidebar({ docs, currentPath }: { docs: DocEntry[]; currentPath: string }) {
  const groups = new Map<string, { label: string; items: DocEntry[] }>();
  for (const d of docs) {
    const key = d.meta.section.trim().toLowerCase();
    const g = groups.get(key) ?? { label: d.meta.section.trim(), items: [] };
    g.items.push(d);
    groups.set(key, g);
  }
  const ordered = [...groups.keys()].sort((a, b) => {
    const ia = (DOC_GROUP_ORDER as readonly string[]).indexOf(a);
    const ib = (DOC_GROUP_ORDER as readonly string[]).indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  return (
    <nav aria-label="Docs" id="docs-navigation">
      <Disclosure label="Docs menu">
        <div className="flex flex-col gap-s4 py-s3 xl:py-0">
          {ordered.map((key) => {
            const g = groups.get(key)!;
            return (
              <div key={key}>
                <p className="label m-0 mb-s2">{g.label}</p>
                <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                  {g.items.map((d) => (
                    <li key={d.slug}>
                      <NavLink href={d.path} current={currentPath === d.path}>
                        {d.meta.title}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </Disclosure>
    </nav>
  );
}
