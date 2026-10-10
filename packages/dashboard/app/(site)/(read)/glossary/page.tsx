import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import { Nib } from '@/components/mascot';
import { LinkRows } from '@/components/site/blocks';
import { Breadcrumb } from '@/components/site/Breadcrumb';
import { GLOSSARY_LINES, HUBS } from '@/lib/content/hubs';
import { getTerms } from '@/lib/content/loader';
import { GLOSSARY_NIB_LINE } from '@/lib/content/nib';
import { breadcrumbTrail } from '@/lib/seo/breadcrumbs';
import { breadcrumbList, collectionPage } from '@/lib/seo/jsonld';
import { buildMetadata } from '@/lib/seo/metadata';

const hub = HUBS.glossary;

export const metadata: Metadata = buildMetadata({ path: hub.path, title: hub.metaTitle, description: hub.description });

export default function GlossaryIndex() {
  const terms = getTerms();
  const trail = breadcrumbTrail(hub.path, hub.name);
  return (
    <>
      <JsonLd
        data={[
          collectionPage(
            { path: hub.path, name: hub.h1, description: hub.description },
            terms.map((t) => ({ name: t.meta.term, path: t.path })),
          ),
          breadcrumbList(trail),
        ]}
      />
      <Breadcrumb trail={trail} />
      <div className="mx-auto max-w-shell px-s4 pb-s6 pt-s5">
        <h1 className="m-0 font-display text-display-l text-fg">{hub.h1}</h1>
        <p className="mb-s3 mt-s3 max-w-prose text-body-l text-fg-soft">{hub.sentence}</p>
        <div className="mb-s5 flex items-end gap-s3">
          <div aria-hidden="true" className="w-[5.5rem] shrink-0 [&_svg]:h-auto [&_svg]:w-full">
            <Nib pose="spy" size={88} />
          </div>
          <p className="nib-voice m-0 pb-s2 text-fg">{GLOSSARY_NIB_LINE}</p>
        </div>
        <LinkRows
          label="Terms"
          titleLevel={2}
          items={terms.map((t) => ({
            title: t.meta.term,
            line: GLOSSARY_LINES[t.slug] ?? t.meta.definition,
            href: t.path,
          }))}
        />
      </div>
    </>
  );
}
