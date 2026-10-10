import { Nib } from '@/components/mascot';
import { JsonLd } from '@/components/seo/JsonLd';
import { AnswerBox, FactList } from '@/components/system/Content';
import { Button } from '@/components/system/Button';
import { docNavOrder, editUrl, neighbours, resolveRelated } from '@/lib/content/links';
import { getDocs, type DocEntry } from '@/lib/content/loader';
import { DOC_SIGNOFFS, DOC_SPOTS } from '@/lib/content/nib';
import { extractFaq, extractSteps } from '@/lib/content/mdx';
import { renderEntry } from '@/lib/content/render';
import { breadcrumbTrail } from '@/lib/seo/breadcrumbs';
import { breadcrumbList, faqPage, howTo, techArticle } from '@/lib/seo/jsonld';
import { ArticleHead } from './ArticleHead';
import { sectionsFromHeadings } from './bearing';
import { PagerPair, RelatedLinks } from './blocks';
import { Breadcrumb } from './Breadcrumb';
import { DocsShell } from './DocsShell';
import { DocsSidebar } from './DocsSidebar';
import { DocsToc } from './DocsToc';
import { PROSE } from './prose';
import { SignOff } from './SignOff';

/** One docs page: breadcrumb, H1, updated, answer lead, facts, body, edit link, prev/next, related. */
export async function DocView({ doc }: { doc: DocEntry }) {
  const docs = getDocs();
  const { lead, content, headings } = await renderEntry(doc);
  const h1 = doc.meta.h1 ?? doc.meta.title;
  const trail = breadcrumbTrail(doc.path, doc.path === '/docs' ? 'Docs' : doc.meta.title);
  const { prev, next } = neighbours(docNavOrder(docs), doc.path);

  const jsonLd: object[] = [
    techArticle({ path: doc.path, headline: h1, description: doc.meta.description, updated: doc.meta.updated, section: doc.meta.section }),
    breadcrumbList(trail),
  ];
  if (doc.meta.howTo) {
    const steps = extractSteps(doc.body);
    if (steps.length > 0) jsonLd.push(howTo(steps, { name: h1, description: doc.meta.description, path: doc.path }));
  }
  if (doc.slug === 'faq') {
    const items = extractFaq(doc.body);
    if (items.length > 0) jsonLd.push(faqPage(items));
  }

  const article = (
    <article>
      <ArticleHead
        h1={h1}
        squiggleId={`doc-${doc.slug}`}
        spot={DOC_SPOTS[doc.slug] ? <Nib pose={DOC_SPOTS[doc.slug]} size={104} /> : undefined}
        dates={[{ label: 'Updated', date: doc.meta.updated }]}
      >
        {lead ? (
          <div className="max-w-prose">
            <AnswerBox>{lead}</AnswerBox>
          </div>
        ) : null}
      </ArticleHead>

      {doc.meta.facts?.length ? (
        <div className="mb-s5 max-w-prose">
          <FactList asOf={doc.meta.updated} facts={doc.meta.facts} />
        </div>
      ) : null}

      <div className={PROSE}>{content}</div>

      {DOC_SIGNOFFS[doc.slug] ? <SignOff>{DOC_SIGNOFFS[doc.slug]}</SignOff> : null}

      <div className="mt-s5 max-w-prose">
        <Button variant="tertiary" href={editUrl(doc)} rel="noopener">
          Edit this page
        </Button>
      </div>
      <div className="mt-s6 max-w-prose">
        <PagerPair prev={prev} next={next} />
      </div>
      <div className="max-w-prose">
        <RelatedLinks items={resolveRelated(doc.meta.related)} />
      </div>
    </article>
  );

  return (
    <>
      <JsonLd data={jsonLd} />
      <Breadcrumb trail={trail} wide />
      <DocsShell
        article={article}
        toc={<DocsToc headings={headings} />}
        sidebar={<DocsSidebar docs={docs} currentPath={doc.path} />}
        sections={sectionsFromHeadings(headings)}
      />
    </>
  );
}
