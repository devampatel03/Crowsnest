import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { extractJsonLd, parseJsonLd } from '@/test/jsonld-extract';
import { organization, website } from '@/lib/seo/jsonld';
import { JsonLd } from './JsonLd';

describe('<JsonLd />', () => {
  it('renders one parseable script per object', () => {
    const html = renderToStaticMarkup(<JsonLd data={[organization(), website()]} />);
    expect(extractJsonLd(html)).toHaveLength(2);
    const types = parseJsonLd(html).map((b) => b['@type']);
    expect(types).toEqual(['Organization', 'WebSite']);
  });

  it('accepts a single object', () => {
    const html = renderToStaticMarkup(<JsonLd data={organization()} />);
    expect(parseJsonLd(html)).toHaveLength(1);
  });

  it('never emits a raw < inside a block, even for hostile strings', () => {
    const html = renderToStaticMarkup(
      <JsonLd data={{ '@context': 'https://schema.org', '@type': 'Thing', name: '</script><img src=x onerror=1>' }} />,
    );
    for (const block of extractJsonLd(html)) expect(block).not.toContain('<');
    expect(parseJsonLd(html)[0].name).toBe('</script><img src=x onerror=1>');
  });
});
