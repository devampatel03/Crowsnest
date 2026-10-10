import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import { LinkRows } from '@/components/site/blocks';
import { BlogCover } from '@/components/site/covers';
import { Breadcrumb } from '@/components/site/Breadcrumb';
import { Button } from '@/components/system/Button';
import { HUBS } from '@/lib/content/hubs';
import { getPosts } from '@/lib/content/loader';
import { BLOG_NIB_LINE } from '@/lib/content/nib';
import { breadcrumbTrail } from '@/lib/seo/breadcrumbs';
import { breadcrumbList, collectionPage } from '@/lib/seo/jsonld';
import { buildMetadata } from '@/lib/seo/metadata';

const hub = HUBS.blog;

export const metadata: Metadata = buildMetadata({ path: hub.path, title: hub.metaTitle, description: hub.description });

export default function BlogIndex() {
  const posts = getPosts();
  const trail = breadcrumbTrail(hub.path, hub.name);
  return (
    <>
      <JsonLd
        data={[
          collectionPage(
            { path: hub.path, name: hub.h1, description: hub.description },
            posts.map((p) => ({ name: p.meta.h1 ?? p.meta.title, path: p.path })),
          ),
          breadcrumbList(trail),
        ]}
      />
      <Breadcrumb trail={trail} />
      <div className="mx-auto max-w-shell px-s4 pb-s6 pt-s5">
        <h1 className="m-0 font-display text-display-l text-fg">{hub.h1}</h1>
        <p className="mb-0 mt-s3 max-w-prose text-body-l text-fg-soft">{hub.sentence}</p>
        <p className="nib-voice mb-s5 mt-s2 text-fg">{BLOG_NIB_LINE}</p>
        <LinkRows
          label="Posts"
          titleLevel={2}
          items={posts.map((p) => ({
            title: p.meta.h1 ?? p.meta.title,
            line: p.meta.dek ?? p.meta.description,
            href: p.path,
            thumb: <BlogCover slug={p.slug} decorative />,
            meta: `${p.meta.published} · ${p.readingMinutes} min read${p.meta.status ? ' · Unreleased' : ''}`,
          }))}
        />
        <div className="mt-s5">
          <Button variant="tertiary" href="/glossary">
            Look up a word in the Glossary
          </Button>
        </div>
      </div>
    </>
  );
}
