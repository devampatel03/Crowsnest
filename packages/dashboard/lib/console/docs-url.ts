// The dashboard runs on your own machine and does not carry the docs; its help links go to the public website.
// NEXT_PUBLIC_DOCS_URL points them at another copy of the site (a fork, or the local site on :3001).

export const DOCS_ORIGIN = (process.env.NEXT_PUBLIC_DOCS_URL || 'https://crowsnest.co.in').replace(/\/+$/, '');

export const docsUrl = (path = '/docs') => `${DOCS_ORIGIN}${path}`;
