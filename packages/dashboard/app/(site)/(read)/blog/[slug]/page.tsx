import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NibClimber, NibMini } from '@/components/mascot';
import { JsonLd } from '@/components/seo/JsonLd';
import { ArticleHead } from '@/components/site/ArticleHead';
import { BlogCover } from '@/components/site/covers';
import { SignOff } from '@/components/site/SignOff';
import { sectionsFromHeadings } from '@/components/site/bearing';
import { RelatedLinks } from '@/components/site/blocks';
import { Breadcrumb } from '@/components/site/Breadcrumb';
import { PROSE } from '@/components/site/prose';
import { BearingRule } from '@/components/system/BearingRule';
import { Button } from '@/components/system/Button';
import { AnswerBox, FactList } from '@/components/system/Content';
import { resolveRelated } from '@/lib/content/links';
import { POST_COVERS } from '@/lib/content/nib';
import { getPost, getPosts } from '@/lib/content/loader';
import { renderEntry } from '@/lib/content/render';
import { breadcrumbTrail } from '@/lib/seo/breadcrumbs';
import { blogPosting, breadcrumbList } from '@/lib/seo/jsonld';
import { buildMetadata } from '@/lib/seo/metadata';
import { canonicalUrl } from '@/lib/site';

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return getPosts().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};
  return buildMetadata({
    path: post.path,
    title: post.meta.metaTitle ?? post.meta.title,
    description: post.meta.description,
    type: 'article',
    publishedTime: post.meta.published,
    modifiedTime: post.meta.updated,
    authors: [post.meta.author],
    ogImage: canonicalUrl(`/og/blog/${post.slug}`),
    ogImageAlt: post.meta.h1 ?? post.meta.title,
    markdown: true,
    section: 'Blog',
  });
}

export default async function PostPage({ params }: Props) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const { lead, content, headings } = await renderEntry(post);
  const h1 = post.meta.h1 ?? post.meta.question ?? post.meta.title;
  const trail = breadcrumbTrail(post.path, post.meta.title);

  return (
    <>
      <JsonLd
        data={[
          blogPosting({
            path: post.path,
            headline: h1,
            description: post.meta.description,
            updated: post.meta.updated,
            published: post.meta.published,
            section: 'Blog',
            author: post.meta.author,
            image: canonicalUrl(`/og/blog/${post.slug}`),
          }),
          breadcrumbList(trail),
        ]}
      />
      <Breadcrumb trail={trail} />
      <div className="mx-auto max-w-shell px-s4 pb-s6 pt-s5 md:grid md:grid-cols-[144px_minmax(0,68ch)] md:justify-start md:gap-x-s5">
        <div className="md:col-start-1 md:row-start-1">
          <BearingRule
            variant="site"
            sections={sectionsFromHeadings(headings)}
            marker={<NibClimber size={52} />}
            markerCompact={<NibMini size={20} />}
            className="md:w-36"
          />
        </div>
        <article className="min-w-0 md:col-start-2 md:row-start-1">
          <ArticleHead
            h1={h1}
            size="m"
            byline={post.meta.author}
            dates={[
              { label: 'Published', date: post.meta.published },
              ...(post.meta.updated !== post.meta.published ? [{ label: 'Updated', date: post.meta.updated }] : []),
            ]}
          />
          {POST_COVERS[post.slug] ? <BlogCover slug={post.slug} className="mb-s5 w-full max-w-[34rem]" /> : null}
          {post.meta.status ? (
            <p className="mb-s4 mt-0 border-l-2 border-field pl-s3 text-body-s text-fg-soft">
              Unreleased. These notes describe version 0.1.0 while it is in development. There is no release tag yet.
            </p>
          ) : null}
          {lead ? (
            <div className="mb-s5">
              <AnswerBox>{lead}</AnswerBox>
            </div>
          ) : null}
          {post.meta.facts?.length ? (
            <div className="mb-s5">
              <FactList asOf={post.meta.updated} facts={post.meta.facts} />
            </div>
          ) : null}
          <div className={PROSE}>{content}</div>
          {POST_COVERS[post.slug] ? <SignOff>{POST_COVERS[post.slug].signoff}</SignOff> : null}
          <RelatedLinks items={resolveRelated(post.meta.related)} />
          <div className="mt-s5">
            <Button variant="tertiary" href="/">
              Crowsnest, the package checker
            </Button>
          </div>
        </article>
      </div>
    </>
  );
}
