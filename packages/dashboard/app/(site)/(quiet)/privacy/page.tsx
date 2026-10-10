import type { Metadata } from 'next';
import { Nib } from '@/components/mascot';
import { JsonLd } from '@/components/seo/JsonLd';
import { Breadcrumb } from '@/components/site/Breadcrumb';
import { PRIVACY } from '@/lib/content/pages';
import { breadcrumbTrail } from '@/lib/seo/breadcrumbs';
import { breadcrumbList, webPage } from '@/lib/seo/jsonld';
import { buildMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = buildMetadata({ path: PRIVACY.path, title: PRIVACY.metaTitle, description: PRIVACY.description });

function Block({ title, text }: { title: string; text: string }) {
  return (
    <section className="mt-s6 max-w-prose">
      <h2 className="m-0 font-sans text-h2 text-fg">{title}</h2>
      <p className="mb-0 mt-s2 text-body text-fg-soft">{text}</p>
    </section>
  );
}

export default function PrivacyPage() {
  const trail = breadcrumbTrail(PRIVACY.path, PRIVACY.name);
  return (
    <>
      <JsonLd
        data={[
          webPage('WebPage', { path: PRIVACY.path, name: PRIVACY.h1, description: PRIVACY.description }),
          breadcrumbList(trail),
        ]}
      />
      <Breadcrumb trail={trail} />
      <div className="mx-auto max-w-shell px-s4 pb-s6 pt-s5">
        <div className="flex items-end justify-between gap-s4">
          <h1 className="m-0 font-display text-display-l text-fg">{PRIVACY.h1}</h1>
          <div aria-hidden="true" className="w-[4.5rem] shrink-0 md:w-[6.5rem] [&_svg]:h-auto [&_svg]:w-full">
            <Nib pose="perch" size={104} />
          </div>
        </div>
        <p className="mb-0 mt-s3 max-w-prose text-body-l text-fg-soft">{PRIVACY.lead}</p>
        <Block {...PRIVACY.local} />
        <section className="mt-s6">
          <h2 className="m-0 font-sans text-h2 text-fg">{PRIVACY.sendsTitle}</h2>
          <ul className="m-0 mt-s3 list-none border-t border-rule p-0">
            {PRIVACY.sends.map((s) => (
              <li key={s.id} className="grid gap-x-s4 gap-y-1 border-b border-rule py-s3 md:grid-cols-[12rem_1fr_14rem]">
                <h3 className="m-0 font-sans text-h3 text-fg">{s.name}</h3>
                <p className="m-0 text-body-s text-fg-soft md:text-body">{s.text}</p>
                <p className="m-0 text-body-s text-fg-mute">{s.when}</p>
              </li>
            ))}
          </ul>
        </section>
        <Block {...PRIVACY.withoutKeys} />
        <Block {...PRIVACY.usage} />
        <Block {...PRIVACY.site} />
        <Block {...PRIVACY.contact} />
        <p className="mb-0 mt-s6 max-w-prose text-body font-semibold text-fg">{PRIVACY.closing}</p>
      </div>
    </>
  );
}
