import { serializeJsonLd } from '@/lib/seo/serialize';

type JsonLdProps = { data: object | readonly object[] };

/**
 * Server component. Renders one JSON-LD script element per object (one script
 * per type keeps tests simple). The less-than character is escaped as <.
 * Never pass data describing text that is not visible on the page.
 */
export function JsonLd({ data }: JsonLdProps) {
  const items = (Array.isArray(data) ? data : [data]) as readonly object[];
  return (
    <>
      {items.map((item, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(item) }}
        />
      ))}
    </>
  );
}

export default JsonLd;
