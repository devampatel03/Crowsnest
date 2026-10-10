import type { Heading } from '@/lib/content/mdx';
import { Disclosure } from './Disclosure';

/** On-page TOC: h2 only. Collapsed disclosure below 1280, sticky column above. */
export function DocsToc({ headings }: { headings: Heading[] }) {
  const items = headings.filter((h) => h.level === 2);
  if (items.length === 0) return null;
  return (
    <nav aria-label="On this page">
      <Disclosure label="On this page">
        <p className="label m-0 mb-s2 max-xl:hidden">On this page</p>
        <ol className="m-0 flex list-none flex-col gap-s1 p-0 py-s3 xl:py-0">
          {items.map((h) => (
            <li key={h.id}>
              <a
                href={`#${h.id}`}
                className="inline-flex min-h-6 items-center py-0.5 text-body-s text-fg-soft no-underline underline-offset-4 hover:text-fg hover:underline max-md:min-h-11"
              >
                {h.text}
              </a>
            </li>
          ))}
        </ol>
      </Disclosure>
    </nav>
  );
}
