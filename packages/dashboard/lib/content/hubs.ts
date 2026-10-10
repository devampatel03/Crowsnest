// Copy for the hub (index) pages, from 02-copy sections 5 and 6 and the meta
// table in section 10. "Supply chain" is unhyphenated. Descriptions are
// 140-160 characters and checked by lib/content/content.test.ts. The docs hub
// is the Introduction page itself (content/docs/introduction.md).

export interface HubCopy {
  path: string;
  /** Breadcrumb leaf. */
  name: string;
  /** `<title>` topic. */
  metaTitle: string;
  description: string;
  h1: string;
  sentence: string;
}

export const HUBS = {
  docs: {
    path: '/docs',
    name: 'Docs',
    metaTitle: 'Introduction',
    description:
      'Learn what Crowsnest is, who it is for, and how to read a call: Clear, Watch or Hold. A plain introduction to a free, open-source package checker.',
    h1: 'Introduction.',
    sentence: 'What Crowsnest is, who it is for, and how to read a call.',
  },
  blog: {
    path: '/blog',
    name: 'Blog',
    metaTitle: 'Blog',
    description:
      'Plain-language posts on package safety: slopsquatting, a safe-install checklist, what to do when Crowsnest says Hold, and the 0.1.0 release notes.',
    h1: 'Blog.',
    sentence: 'Plain-language notes on keeping the packages you install safe.',
  },
  glossary: {
    path: '/glossary',
    name: 'Glossary',
    metaTitle: 'Glossary',
    description:
      'Six plain definitions for package security: slopsquatting, typosquatting, dependency confusion, maintainer takeover, lockfile and supply chain attack.',
    h1: 'Glossary.',
    sentence: 'Six words you will meet when you install packages, in plain language.',
  },
} as const satisfies Record<string, HubCopy>;

/** One line per glossary term for the index (02-copy 6.1). Keys are term slugs. */
export const GLOSSARY_LINES: Record<string, string> = {
  slopsquatting: 'A package name an AI assistant made up, registered by an attacker.',
  typosquatting: 'A package named almost like a popular one.',
  'dependency-confusion': 'A public package that copies the name of a private one.',
  'maintainer-takeover': 'A package passing to a new, unvetted account.',
  lockfile: 'The file that records the exact version of everything you installed.',
  'supply-chain-attack': 'An attack through something you rely on, such as a package.',
};
