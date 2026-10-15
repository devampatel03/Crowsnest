const { REDIRECTS } = require('./lib/redirects');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Parallel builds and the screenshot server can each use their own output folder: NEXT_DIST_DIR=.next-site
  distDir: process.env.NEXT_DIST_DIR || '.next',
  experimental: {},
  // Screenshot builds only (NEXT_SKIP_TYPECHECK=1): another package's type error must not block a visual check. `npm run typecheck` is the gate.
  typescript: { ignoreBuildErrors: process.env.NEXT_SKIP_TYPECHECK === '1' },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  },
  // 308 for every URL that was removed or renamed (lib/redirects.js).
  async redirects() {
    return REDIRECTS;
  },
  // `<page>.md` serves the raw Markdown of any docs, blog or glossary page.
  async rewrites() {
    return [
      { source: '/docs.md', destination: '/raw/docs' },
      { source: '/docs/:path*.md', destination: '/raw/docs/:path*' },
      { source: '/blog/:slug.md', destination: '/raw/blog/:slug' },
      { source: '/glossary/:slug.md', destination: '/raw/glossary/:slug' },
    ];
  },
};

module.exports = nextConfig;
