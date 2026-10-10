import Link from 'next/link';
import type { Crumb } from '@/lib/seo/types';

/**
 * Visible breadcrumb. Pass the SAME array that feeds breadcrumbList() so the
 * markup and the JSON-LD cannot drift.
 */
export function Breadcrumb({ trail, wide = false }: { trail: Crumb[]; wide?: boolean }) {
  if (trail.length <= 1) return null;
  return (
    <nav aria-label="Breadcrumb" className={`mx-auto px-s4 pt-s4 ${wide ? 'max-w-docs' : 'max-w-shell'}`}>
      <ol className="m-0 flex list-none flex-wrap items-center gap-x-s2 p-0 font-sans text-label text-fg-mute">
        {trail.map((c, i) => {
          const last = i === trail.length - 1;
          return (
            <li key={c.path} className="flex items-center gap-s2">
              {last ? (
                <span aria-current="page" className="text-fg">
                  {c.name}
                </span>
              ) : (
                <Link
                  href={c.path}
                  className="inline-flex min-h-6 items-center text-fg-mute underline-offset-4 hover:text-fg hover:underline max-md:min-h-11"
                >
                  {c.name}
                </Link>
              )}
              {last ? null : <span aria-hidden="true">›</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
