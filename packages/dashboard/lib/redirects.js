// Permanent (308) redirects for every URL removed or renamed in round 2
// (brief section 12). Plain CommonJS so next.config.js can require it and the
// vitest suite can read the same table. Order matters only where patterns
// overlap; none do.

const detections = [
  'xz-pattern',
  'shai-hulud',
  'slopsquatting',
  'slsa-poisoning',
  'blast-radius',
  'sleeper-dependency',
  'identity-drift',
  'typosquat-distance',
  'abandoned-popular',
  'oidc-token-misuse',
  'dep-confusion',
  'ci-cache-poisoning',
  'ioc-match',
  'maintainer-reputation',
];

/** Renamed docs pages: old slug -> new path. */
const RENAMED_DOCS = {
  'getting-started': '/docs/quickstart',
  'install-cli': '/docs/cli',
  'scan-a-project': '/docs/cli',
  'read-an-incident': '/docs/dashboard',
  'self-hosting': '/docs/installation',
  'slack-bot': '/docs/integrations/slack',
  'vscode-extension': '/docs/integrations/vscode',
  introduction: '/docs',
};

/** Deleted docs pages: all go to the docs home. */
const DELETED_DOCS = ['architecture', 'coral-engine', 'agent-pipeline', 'api'];

const DELETED_POSTS = [
  'why-detections-are-sql-joins-not-api-polling',
  'time-machine-snapshots-replay',
  'detecting-a-token-theft-worm-with-one-sql-join',
  'what-a-maintainer-takeover-looks-like-in-data',
  'what-a-lockfile-diff-can-tell-you-that-a-cve-cannot',
];

const DELETED_TERMS = ['token-theft-worm', 'slsa-poisoning', 'sleeper-dependency', 'identity-drift'];

const pair = (source, destination) => ({ source, destination, permanent: true });

const REDIRECTS = [
  pair('/compare', '/'),
  pair('/compare/:slug', '/'),
  ...Object.entries(RENAMED_DOCS).map(([from, to]) => pair(`/docs/${from}`, to)),
  ...DELETED_DOCS.map((s) => pair(`/docs/${s}`, '/docs')),
  pair('/docs/detections', '/docs'),
  pair('/docs/detections/:slug', '/docs'),
  pair('/blog/how-slopsquatting-works', '/blog/what-is-slopsquatting'),
  ...DELETED_POSTS.map((s) => pair(`/blog/${s}`, '/blog')),
  ...DELETED_TERMS.map((s) => pair(`/glossary/${s}`, '/glossary')),
  // Markdown twins of renamed or deleted pages follow the same moves.
  pair('/compare/:slug.md', '/'),
  ...Object.entries(RENAMED_DOCS)
    .filter(([from]) => from !== 'introduction')
    .map(([from, to]) => pair(`/docs/${from}.md`, `${to}.md`)),
  ...DELETED_DOCS.map((s) => pair(`/docs/${s}.md`, '/docs')),
  pair('/docs/detections/:slug.md', '/docs'),
  pair('/docs/introduction.md', '/docs.md'),
  pair('/blog/how-slopsquatting-works.md', '/blog/what-is-slopsquatting.md'),
  ...DELETED_POSTS.map((s) => pair(`/blog/${s}.md`, '/blog')),
  ...DELETED_TERMS.map((s) => pair(`/glossary/${s}.md`, '/glossary')),
];

/** Every old URL the redirect table must cover (used by the test). */
const OLD_URLS = [
  '/compare',
  '/compare/dependabot',
  '/compare/socket',
  '/compare/snyk',
  ...Object.keys(RENAMED_DOCS)
    .filter((s) => s !== 'introduction')
    .map((s) => `/docs/${s}`),
  ...DELETED_DOCS.map((s) => `/docs/${s}`),
  '/docs/detections',
  ...detections.map((s) => `/docs/detections/${s}`),
  '/blog/how-slopsquatting-works',
  ...DELETED_POSTS.map((s) => `/blog/${s}`),
  ...DELETED_TERMS.map((s) => `/glossary/${s}`),
];

module.exports = { REDIRECTS, OLD_URLS };
