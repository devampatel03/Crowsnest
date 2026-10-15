// Verified facts used by metadata, JSON-LD and llms.txt. Every value here is
// traceable to the repo. Do not add statistics.

export const SITE_NAME = 'Crowsnest';
export const REPO_URL = 'https://github.com/devampatel03/Crowsnest';
export const ISSUES_URL = `${REPO_URL}/issues`;
export const NEW_ISSUE_URL = `${REPO_URL}/issues/new/choose`;
export const LICENSE_NAME = 'Apache-2.0';
export const LICENSE_URL = 'https://www.apache.org/licenses/LICENSE-2.0';
export const VERSION = '0.1.0';

/** Byline used on every post and the author field of Article JSON-LD (no named author). */
export const AUTHOR_NAME = 'Crowsnest contributors';

/** Docker path from README "Fastest path: Docker". */
export const DOCKER_COMMAND = 'docker compose -f infra/docker-compose.yml up --build';

export const OPERATING_SYSTEMS = 'Linux, macOS, Windows';

/** Public hubs and crawl-control lists shared by robots.ts and tests. */
export const PUBLIC_ALLOW = [
  '/',
  '/docs',
  '/blog',
  '/glossary',
  '/about',
  '/privacy',
  '/llms.txt',
  '/llms-full.txt',
  '/rss.xml',
] as const;

export const PRIVATE_DISALLOW = ['/api', '/horizon', '/lookout', '/hold', '/log', '/raw'] as const;

export const AI_CRAWLERS = [
  'GPTBot',
  'ClaudeBot',
  'PerplexityBot',
  'Google-Extended',
  'CCBot',
  'Applebot-Extended',
] as const;

/** Logo for Organization JSON-LD: app/apple-icon.tsx (180x180). */
export const LOGO_PATH = '/apple-icon';

export const TITLE_BRAND = ' — Crowsnest';
export const TITLE_MAX = 60;
export const TOPIC_MAX = TITLE_MAX - TITLE_BRAND.length; // 48
export const DESC_MIN = 140;
export const DESC_MAX = 160;
export const ROOT_TITLE = 'Crowsnest: a lookout for what you install';
