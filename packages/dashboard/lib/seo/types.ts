// Types shared by the SEO helpers, the content loader (site) and the
// content frontmatter (content writer). Dates are ISO YYYY-MM-DD strings.

export type ContentKind = 'doc' | 'post' | 'term';

/** Page kind used by the JSON-LD test matrix. */
export type PageKind =
  | 'landing'
  | 'docs'
  | 'docIndex'
  | 'post'
  | 'blogIndex'
  | 'term'
  | 'glossaryIndex'
  | 'utility';

interface FrontmatterBase {
  /** Short noun-phrase label used in nav, breadcrumbs and the <title> topic. */
  title: string;
  /** 140-160 characters, plain sentence. Also the meta description and JSON-LD description. */
  description: string;
  /** Path segment(s) after the section root, no slashes at the ends. e.g. "quickstart", "integrations/slack". */
  slug: string;
  /** Sort order within its section. */
  order: number;
  /** ISO date of the last real content change. Never rewritten by the build. */
  updated: string;
  /** Related pages as site paths, e.g. "/docs/cli". At least 3 for articles. */
  related: string[];
  /** H1 when it differs from `title`. */
  h1?: string;
  /** Optional <title> topic override, used only when the topic is longer than 48 characters. */
  metaTitle?: string;
}

export interface DocFrontmatter extends FrontmatterBase {
  /** Docs group: "Get started", "Use", "Integrations", "Reference", "Help", "Community". Also JSON-LD articleSection. */
  section: string;
  /** True when the body has a numbered steps list and emits HowTo JSON-LD. */
  howTo?: boolean;
}

export interface PostFrontmatter extends FrontmatterBase {
  published: string;
  /** Byline. Defaults to AUTHOR_NAME ("Crowsnest contributors") when the file has none. */
  author: string;
  /** Optional publication state. "draft-until-tagged" marks release notes written before a GitHub release tag exists; update or remove it when the owner tags the release. The loader schema ignores it until it is wired in. */
  status?: 'draft-until-tagged';
  /** One-line dek shown on the index and used by llms.txt. */
  dek?: string;
}

export interface GlossaryFrontmatter extends FrontmatterBase {
  /** The term, e.g. "Slopsquatting". */
  term: string;
  /** The visible definition sentence (<= 40 words). JSON-LD description mirrors it. */
  definition: string;
}

export type AnyFrontmatter = DocFrontmatter | PostFrontmatter | GlossaryFrontmatter;

export interface Crumb {
  name: string;
  /** Site path, e.g. "/docs". The builder turns it into an absolute URL. */
  path: string;
}

export interface FaqItem {
  question: string;
  /** Plain text answer, identical to the visible answer after HTML strip. */
  answer: string;
}

export interface HowToStepInput {
  name: string;
  text: string;
  /** Fragment id of the visible step heading, without "#". */
  anchor?: string;
}

export interface ArticleInput {
  /** Canonical site path. */
  path: string;
  /** Must equal the visible H1. */
  headline: string;
  /** Must equal the meta description. */
  description: string;
  updated: string;
  published?: string;
  /** JSON-LD articleSection. */
  section: string;
  /** Person name; when absent the author is the Organization. */
  author?: string;
}
