import type { PageKind } from './types';

// Non-sitewide JSON-LD types each page kind must emit (brief section 9).
// Organization and WebSite come from the site frame on every public page.
// SoftwareApplication, FAQPage and HowTo on "/" only. Docs with numbered
// steps add HowTo (frontmatter `howTo: true`); /docs/faq adds FAQPage.
export const EXPECTED_TYPES: Record<PageKind, readonly string[]> = {
  landing: ['SoftwareApplication', 'FAQPage', 'HowTo'],
  docs: ['TechArticle', 'BreadcrumbList'],
  docIndex: ['TechArticle', 'BreadcrumbList'],
  post: ['BlogPosting', 'BreadcrumbList'],
  blogIndex: ['CollectionPage', 'BreadcrumbList'],
  term: ['DefinedTerm', 'BreadcrumbList'],
  glossaryIndex: ['CollectionPage', 'BreadcrumbList'],
  utility: ['WebPage', 'BreadcrumbList'],
};

export const SITEWIDE_TYPES = ['Organization', 'WebSite'] as const;
