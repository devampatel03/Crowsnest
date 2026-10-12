import { ENTITY_DEFINITION } from '@/lib/seo/entity';
import { LICENSE_NAME, REPO_URL, VERSION } from '@/lib/seo/constants';

// Text for /about and /privacy (02-copy section 7). Owner answers of
// 2026-10-07: no named author, no contact email (issues on GitHub), no
// analytics, 0.1.0 worded as unreleased. Nothing here is a placeholder.

export const ABOUT = {
  path: '/about',
  name: 'About',
  metaTitle: 'About',
  h1: 'About Crowsnest.',
  description:
    'Crowsnest is a free, open-source supply chain security tool you run yourself. Who makes it, the Apache-2.0 licence, where the code lives and how to help.',
  lead: ENTITY_DEFINITION,
  body: [
    'Crowsnest is open source under the Apache-2.0 licence. You run it on your own machine. It has a dashboard, a command line tool, a Slack bot and a VS Code extension.',
    `It is version ${VERSION} and has not been released yet. That makes it early software, so expect rough edges and tell us when you find one.`,
    'Anyone can help. The Contributing page explains how to report a bug, ask for a feature or send a change.',
  ],
  facts: [
    { id: 'licence', name: 'Licence', value: LICENSE_NAME },
    { id: 'code', name: 'Code', value: REPO_URL },
    { id: 'version', name: 'Version', value: `${VERSION} (not released yet)` },
    { id: 'use', name: 'Where you use it', value: 'Terminal, VS Code, Slack, dashboard' },
    { id: 'made', name: 'Made by', value: 'Crowsnest contributors' },
    { id: 'mascot', name: 'Mascot', value: 'Nib the crow' },
    { id: 'issues', name: 'Contact', value: 'GitHub issues' },
  ],
} as const;

export const PRIVACY = {
  path: '/privacy',
  name: 'Privacy',
  metaTitle: 'Privacy',
  h1: 'Privacy.',
  description:
    'What leaves your machine when you run Crowsnest: package lookups on public registries and optional calls to Anthropic, Socket and GitHub. Lockfiles stay local.',
  lead: 'Crowsnest runs on your machine. This page lists what leaves it, and when.',
  local: {
    title: 'What stays on your machine',
    text: "Your lockfiles, your results and Crowsnest's own data file stay where you run it. Crowsnest has no account system.",
  },
  sendsTitle: 'What can leave your machine',
  sends: [
    {
      id: 'npm',
      name: 'npm registry',
      text: 'The names of packages being looked up, up to 100 per scan. If you set NPM_TOKEN, it is sent to the npm registry as a bearer token. PyPI is not contacted during a scan.',
      when: 'During a scan, with or without keys.',
    },
    {
      id: 'osv',
      name: 'OSV (api.osv.dev)',
      text: 'The names of packages being looked up for known vulnerabilities, up to 500 per scan.',
      when: 'During a scan, with or without keys.',
    },
    {
      id: 'anthropic',
      name: 'Anthropic',
      text: 'When Crowsnest plans a scan: the project folder path, the kind of project, the time of the last scan, any recent campaign names and your GitHub organisation name. For each check that finds something, up to 20 result rows are sent too. Triage and remediation do not call Anthropic.',
      when: 'Only if you set ANTHROPIC_API_KEY.',
    },
    { id: 'socket', name: 'Socket', text: 'Package names, up to 50 npm packages per scan.', when: 'Only if you set SOCKET_API_KEY.' },
    { id: 'github', name: 'GitHub', text: 'Repository and maintainer lookups.', when: 'Only if you set GITHUB_TOKEN.' },
    { id: 'slack', name: 'Slack', text: 'The posts the bot makes to the channel you choose.', when: 'Only if you run the Slack bot.' },
  ],
  withoutKeys: {
    title: 'Without keys',
    text: 'The optional calls to Anthropic, Socket and GitHub are not made. A scan still looks up package names on the npm registry and OSV, as listed above, and Crowsnest uses cached data for the rest.',
  },
  usage: {
    title: 'Usage data',
    text: 'Crowsnest sends no usage data to its authors.',
  },
  site: {
    title: 'This website',
    text: 'This website counts page views with Vercel Web Analytics. It sets no cookies and does not follow you from site to site. Crowsnest itself, on your machine, has no analytics.',
  },
  contact: {
    title: 'Questions',
    text: 'Ask on GitHub issues. There is no contact email.',
  },
  closing: 'You decide which keys to add. Each key adds only the call listed above.',
} as const;
