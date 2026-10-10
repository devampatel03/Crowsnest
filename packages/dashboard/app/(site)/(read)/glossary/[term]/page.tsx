import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { JsonLd } from '@/components/seo/JsonLd';
import { ArticleHead } from '@/components/site/ArticleHead';
import { RelatedLinks } from '@/components/site/blocks';
import { Breadcrumb } from '@/components/site/Breadcrumb';
import { PROSE } from '@/components/site/prose';
import { AnswerBox, FactList } from '@/components/system/Content';
import { resolveRelated } from '@/lib/content/links';
import { getTerm, getTerms } from '@/lib/content/loader';
import { renderEntry } from '@/lib/content/render';
import { breadcrumbTrail } from '@/lib/seo/breadcrumbs';
import { breadcrumbList, definedTerm } from '@/lib/seo/jsonld';
import { buildMetadata } from '@/lib/seo/metadata';
import { canonicalUrl } from '@/lib/site';

type Props = { params: Promise<{ term: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return getTerms().map((t) => ({ term: t.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { term } = await params;
  const entry = getTerm(term);
  if (!entry) return {};
  return buildMetadata({
    path: entry.path,
    title: entry.meta.metaTitle ?? entry.meta.title,
    description: entry.meta.description,
    type: 'article',
    modifiedTime: entry.meta.updated,
    section: 'Glossary',
    ogImage: canonicalUrl(`/og/glossary/${entry.slug}`),
    markdown: true,
  });
}

export default async function TermPage({ params }: Props) {
  const { term } = await params;
  const entry = getTerm(term);
  if (!entry) notFound();

  const { content } = await renderEntry(entry);
  const h1 = entry.meta.h1 ?? `${entry.meta.term}.`;
  const trail = breadcrumbTrail(entry.path, entry.meta.title);

  return (
    <>
      <JsonLd
        data={[
          definedTerm({ path: entry.path, name: entry.meta.term, description: entry.meta.definition }),
          breadcrumbList(trail),
        ]}
      />
      <Breadcrumb trail={trail} />
      <div className="mx-auto max-w-shell px-s4 pb-s6">
        <article className="max-w-prose">
          <ArticleHead h1={h1} size="m" dates={[{ label: 'Updated', date: entry.meta.updated }]} />
          <div className="mb-s5">
            <AnswerBox>{entry.meta.definition}</AnswerBox>
          </div>
          {entry.meta.facts?.length ? (
            <div className="mb-s5">
              <FactList asOf={entry.meta.updated} facts={entry.meta.facts} />
            </div>
          ) : null}
          <div className={PROSE}>{content}</div>
          <RelatedLinks items={resolveRelated(entry.meta.related)} />
        </article>
      </div>
    </>
  );
}
