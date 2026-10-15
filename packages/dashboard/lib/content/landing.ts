// Landing page copy, "supply chain" unhyphenated. The FAQ
// list feeds both the visible disclosures and the FAQPage JSON-LD, and the
// install rows feed both the visible commands and the HowTo JSON-LD, so the
// markup cannot drift from the page. No tags from the copy deck are carried
// over: nothing unverified ships.

import type { HorizonTick } from '@/components/system/HorizonLine';
import { ENTITY_DEFINITION } from '@/lib/seo/entity';
import type { FaqItem, HowToStepInput } from '@/lib/seo/types';

export const HERO = {
  h1: 'A lookout for what you install.',
  subhead: 'Nib watches the packages coming aboard your project and rings the bell when one looks wrong.',
  cta: 'Install Crowsnest',
  trust: 'Free and open source (Apache-2.0) · runs on your machine · no account.',
  bandLabel: 'A sample project with twelve packages on a line. Three have been checked.',
  caption: 'Sample project',
  fine: 'These are made-up packages, shown to explain the idea.',
  /** Nib's bubble at first paint. */
  restBubble: "Tap a mark. I'll tell you what I see.",
  /** Hero Nib button: accessible name and tooltip. */
  nibButton: "Ring Nib's bell",
  nibTip: 'Tap for a tip',
  nibTitle: 'Nib on the masthead',
  /** Bubble per selected mark; a Hold mark shows no bubble (the call line stands alone). */
  markBubbles: { 't2': 'Looks fine to me.', 't6': 'Hm. Worth a closer look.', 't9': '' } as Record<string, string>,
  /** Fixed cycle for the bell, no randomness. After the last it returns to the first. */
  bellLines: [
    'Still watching.',
    'Keep your lockfile committed.',
    'Read the name letter by letter.',
    'New and little-used deserves a second look.',
    'Try a sample package below.',
  ],
} as const;

/** Twelve ticks on the line, three of them checked. */
export const HORIZON_TICKS: HorizonTick[] = [
  { id: 't0' },
  { id: 't1' },
  { id: 't2', sighting: { name: 'tidy-dates', level: 'clear', call: 'Clear. tidy-dates has no warning signs.' } },
  { id: 't3' },
  { id: 't4' },
  { id: 't5' },
  {
    id: 't6',
    sighting: {
      name: 'fast-csv-lite',
      level: 'watch',
      call: 'Watch. fast-csv-lite has almost no downloads and no repository link.',
    },
  },
  { id: 't7' },
  { id: 't8' },
  {
    id: 't9',
    sighting: {
      name: 'quikrequest',
      level: 'hold',
      call: 'Hold. quikrequest is six days old and almost nobody uses it.',
    },
  },
  { id: 't10' },
  { id: 't11' },
];

export const HOW = {
  title: 'How it protects you.',
  /** Visually hidden h3 naming the strip. */
  stripTitle: 'The night the quikrequest came aboard.',
  captions: [
    'You add a package. It joins the line.',
    'One crate is wearing a very familiar name.',
    'I check its age, its users, and how familiar its name looks.',
    'Hold. Not this one.',
    'The rest come aboard. This one waits for you.',
  ],
  /** Text equivalent of the strip, in the DOM for screen readers. */
  stripAlt:
    'A five-panel drawing about a made-up package. Panel 1: a small crow named Nib sits on a masthead with a lit lantern. Three wooden crates queue at the rail, labelled tidy-dates, fast-csv-lite and one new crate; the caption reads "You add a package. It joins the line." Panel 2: close on two crates. One carries a crown and is the famous package. The next, labelled quikrequest, stands one step behind it wearing a fake moustache; the caption reads "One crate is wearing a very familiar name." Panel 3: Nib raises a spyglass. A round inset shows the crate\'s tag with three marks: new, almost nobody uses it, and a name a hair from a famous one; the caption reads "I check its age, its users, and how familiar its name looks." Panel 4: Nib pulls a bell cord. The bell swings and a three-notch gauge in the corner shows Hold; the caption reads "Hold. Not this one." Panel 5: the quikrequest crate sits on the dock with a tag tied to it while the other crates are loaded, and Nib is back on the perch; the caption reads "The rest come aboard. This one waits for you."',
  note: 'Made-up packages, drawn to explain the idea.',
  runs: [
    { lead: 'In your terminal', href: '/docs/cli' },
    { lead: 'in VS Code', href: '/docs/integrations/vscode' },
    { lead: 'in Slack', href: '/docs/integrations/slack' },
    { lead: 'on a dashboard', href: '/docs/dashboard' },
  ],
  honesty: 'Crowsnest flags a package; you decide what to do. The install check runs when you install through Crowsnest. A scan reads the lockfile you already have.',
  closing: 'Clear means nothing was found. Hold means stop and look.',
} as const;

export const TRY = {
  title: 'Check a name.',
  lead: 'Pick a sample package and see how Crowsnest would call it.',
  panelLabel: 'Sample data, not real packages.',
  legend: 'Sample package',
  reasonsLabel: 'Why',
  nothingFound: 'No warning signs found.',
  /** Nib's bubble and note per sample. Hold has no note: the Call says what to do. */
  nib: {
    'tidy-dates': { pose: 'nod', title: 'Nib nods.', bubble: 'Looks fine. Let it aboard.', note: 'Nothing found. That is all Clear ever means.' },
    'fast-csv-lite': { pose: 'squint', title: 'Nib squints at the package.', bubble: 'Hm. Not sure about this one.', note: 'Check who wrote it before you install.' },
    quikrequest: { pose: 'ring', title: 'Nib rings the bell.', bubble: 'Hold. Not this one.', note: '' },
  } as Record<string, { pose: 'nod' | 'squint' | 'ring'; title: string; bubble: string; note: string }>,
  honesty: 'Real checks also read the registry and threat lists. Without keys Crowsnest uses cached data.',
  closing: 'The sample uses four of the signals Crowsnest checks. It never sends anything anywhere.',
} as const;

export const INSTALL = {
  title: 'Install Crowsnest.',
  lead: 'You need Docker. Three commands start Crowsnest on your machine.',
  rows: [
    { id: 'get', short: 'clone', label: 'Get the code', command: 'git clone https://github.com/devampatel03/Crowsnest.git && cd Crowsnest' },
    { id: 'env', short: 'settings file', label: 'Create your settings file', command: 'cp .env.example .env' },
    { id: 'start', short: 'start', label: 'Start it', command: 'docker compose -f infra/docker-compose.yml up --build' },
  ],
  windowsNote: 'On Windows Command Prompt, use `copy .env.example .env`.',
  after: 'Open http://localhost:3000. API keys are optional.',
  other: 'Other ways to install',
  haulCaption: "Three commands. I'll steady the crate.",
  early: 'Version 0.1.0 is early. A first scan on a fresh install can fail when no API keys are set.',
  earlyLink: 'Troubleshooting',
  earlyTail: 'has the details.',
  closing:
    'No sign-up. No key. Stop it any time with `docker compose -f infra/docker-compose.yml down`.',
  howToName: 'Install Crowsnest with Docker',
} as const;

/** HowTo steps mirror the three install rows, word for word. */
export const INSTALL_STEPS: HowToStepInput[] = INSTALL.rows.map((r) => ({
  name: r.label,
  text: r.command,
  anchor: 'install',
}));

export const FAQ_TITLE = 'Questions.';
export const FAQ_SIGNOFF = "Nib's tip: commit your lockfile.";

export interface LandingFaq extends FaqItem {
  id: string;
}

export const FAQ: LandingFaq[] = [
  {
    id: 'what',
    question: 'What is Crowsnest?',
    answer: `${ENTITY_DEFINITION} Each package gets a call: Clear, Watch or Hold.`,
  },
  {
    id: 'slopsquatting',
    question: 'What is slopsquatting?',
    answer:
      'Slopsquatting is when an attacker registers a package name that an AI coding assistant has invented, then waits for someone to install it. Crowsnest warns you about new, little-used packages with names like that before they land in your project.',
  },
  {
    id: 'keys',
    question: 'Do I need API keys?',
    answer:
      'No. Every key is optional. Without keys, Crowsnest uses cached data and still runs. Keys let it look things up live: a Socket key for threat alerts, a GitHub token for repository details, and an Anthropic key for AI-assisted analysis.',
  },
  {
    id: 'npm',
    question: 'Does it stop npm install?',
    answer:
      'Only when you install through Crowsnest. crowsnest install <package> checks first and stops at risk 0.6 or above. A plain npm install is not checked. If Crowsnest cannot be reached, the install goes ahead and you see a warning.',
  },
  {
    id: 'privacy',
    question: 'Does my code leave my machine?',
    answer:
      "Your lockfile and results stay on your machine. A scan sends package names to the npm registry and OSV. Optional keys add calls to Socket, GitHub and Anthropic, and only when you set them. The Privacy page lists every one.",
  },
  {
    id: 'cost',
    question: 'What does it cost?',
    answer:
      'Nothing. Crowsnest is free and open source under the Apache-2.0 licence. You run it yourself, so your only costs are your own machine and any optional services whose keys you choose to add.',
  },
];

export const FAQ_CLOSING = [
  { label: 'Read the docs', href: '/docs' },
  { label: 'Install Crowsnest', href: '#install' },
] as const;
