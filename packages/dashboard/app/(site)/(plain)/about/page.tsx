import type { Metadata } from 'next';
import { Nib } from '@/components/mascot';
import { JsonLd } from '@/components/seo/JsonLd';
import { Breadcrumb } from '@/components/site/Breadcrumb';
import { Button } from '@/components/system/Button';
import { MEET_NIB } from '@/lib/content/nib';
import { ABOUT } from '@/lib/content/pages';
import { REPO_URL } from '@/lib/seo/constants';
import { breadcrumbTrail } from '@/lib/seo/breadcrumbs';
import { breadcrumbList, webPage } from '@/lib/seo/jsonld';
import { buildMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = buildMetadata({ path: ABOUT.path, title: ABOUT.metaTitle, description: ABOUT.description });

export default function AboutPage() {
  const trail = breadcrumbTrail(ABOUT.path, ABOUT.name);
  return (
    <>
      <JsonLd
        data={[
          webPage('AboutPage', { path: ABOUT.path, name: ABOUT.h1, description: ABOUT.description }, { aboutSoftware: true }),
          breadcrumbList(trail),
        ]}
      />
      <Breadcrumb trail={trail} />
      <div className="mx-auto max-w-shell px-s4 pb-s6 pt-s5">
        <h1 className="m-0 font-display text-display-l text-fg">{ABOUT.h1}</h1>
        <div className="mt-s4 max-w-prose">
          <p className="m-0 font-display text-lead italic text-fg">{ABOUT.lead}</p>
          {ABOUT.body.map((p) => (
            <p key={p} className="mb-0 mt-s4 text-body text-fg-soft">
              {p}
            </p>
          ))}
        </div>
        <section aria-labelledby="meet-nib" className="mt-s6">
          <h2 id="meet-nib" className="m-0 font-sans text-h2 text-fg">
            {MEET_NIB.title}
          </h2>
          <div className="mt-s3 max-w-prose">
            {MEET_NIB.paragraphs.map((p) => (
              <p key={p} className="mb-0 mt-s3 text-body text-fg-soft first:mt-0">
                {p}
              </p>
            ))}
          </div>
          <figure className="m-0 mt-s5">
            <ul className="m-0 grid list-none grid-cols-2 gap-x-s4 gap-y-s5 p-0 md:grid-cols-3 lg:grid-cols-6">
              {MEET_NIB.poses.map((p) => (
                <li key={p.pose} className="flex flex-col items-start gap-s2">
                  <div aria-hidden="true" className="w-full max-w-[9.375rem] [&_svg]:h-auto [&_svg]:w-full">
                    <Nib pose={p.pose} size={150} />
                  </div>
                  <p className="nib-voice-s m-0 text-fg">{p.caption}</p>
                </li>
              ))}
            </ul>
            <figcaption className="sr-only">{MEET_NIB.sheetAlt}</figcaption>
          </figure>
        </section>
        <h2 className="mb-s3 mt-s6 font-sans text-h2 text-fg">Facts</h2>
        <dl className="m-0 flex max-w-prose flex-col gap-s3">
          {ABOUT.facts.map((f) => (
            <div key={f.id}>
              <dt className="text-label text-fg-mute">{f.name}</dt>
              <dd className="m-0 break-words text-body text-fg">{f.value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-s5 flex flex-wrap items-center gap-x-s5 gap-y-s2">
          <Button variant="tertiary" href="/docs/contributing">
            Contributing
          </Button>
          <Button variant="tertiary" href={REPO_URL} rel="noopener">
            GitHub
          </Button>
          <Button variant="tertiary" href="/privacy">
            Privacy
          </Button>
        </div>
      </div>
    </>
  );
}
