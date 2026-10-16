// Nib's lines for the public site. Every
// line is 14 words or fewer, has no exclamation mark, and none sits next to a
// Hold or an error step: Troubleshooting and Privacy have no sign-off at all.
// The tips are statements the docs already make.

import type { NibPose } from '@/components/mascot';

/** Footer sign-off, with the `wave` pose at 48px. */
export const FOOTER_SIGNOFF = 'Thanks for reading. Commit your lockfile.';

/** Page-end sign-off per docs slug. Troubleshooting is deliberately absent. */
export const DOC_SIGNOFFS: Record<string, string> = {
  introduction: "Nib's tip: start with the Quickstart.",
  quickstart: "Nib's tip: scan one real project.",
  installation: "Nib's tip: Docker first, source later.",
  cli: "Nib's tip: use `crowsnest install`.",
  dashboard: "Nib's tip: read the first step.",
  'integrations/slack': "Nib's tip: keep the channel small.",
  'integrations/vscode': "Nib's tip: hover the mark for reasons.",
  'integrations/models': "Nib's tip: no model is a fine start.",
  configuration: "Nib's tip: start with no keys.",
  faq: "Nib's tip: commit your lockfile.",
  contributing: "Nib's tip: a bug report is a contribution.",
};

/** Page-head spot per docs slug (decorative, 120px at most). */
export const DOC_SPOTS: Record<string, NibPose> = {
  introduction: 'perch',
  quickstart: 'haul',
  installation: 'haul',
  cli: 'perch',
  dashboard: 'perch',
  configuration: 'spy',
  'integrations/slack': 'wave',
  'integrations/vscode': 'wave',
  'integrations/models': 'spy',
  faq: 'tilt',
  troubleshooting: 'tilt',
  contributing: 'wave',
};

export type CoverKind = 'slopsquat' | 'checklist' | 'dock' | 'flag';

/** Blog covers: alt text and sign-off per post. */
export const POST_COVERS: Record<string, { kind: CoverKind; alt: string; signoff: string }> = {
  'what-is-slopsquatting': {
    kind: 'slopsquat',
    alt: 'Nib holds a crate with a question mark and a note that reads made up.',
    signoff: "Nib's tip: search a suggestion yourself first.",
  },
  'how-to-stay-safe-from-malicious-packages': {
    kind: 'checklist',
    alt: 'Nib with a clipboard of five checkboxes.',
    signoff: "Nib's tip: five small checks win.",
  },
  'what-to-do-when-crowsnest-says-hold': {
    kind: 'dock',
    alt: 'Nib steadies a bell beside a crate on the dock. The scene is calm.',
    signoff: "Nib's tip: scan again after the fix.",
  },
  'crowsnest-0-1-0-release-notes': {
    kind: 'flag',
    alt: 'Nib plants a small flag.',
    signoff: "Nib's tip: report any rough edge.",
  },
};

export const BLOG_NIB_LINE = 'Short reads from the masthead.';
export const GLOSSARY_NIB_LINE = 'Words I hear a lot on watch.';

/** About: "Meet Nib.". */
export const MEET_NIB = {
  title: 'Meet Nib.',
  paragraphs: [
    "Nib is a small crow who sits at the masthead of your project, watches the packages coming aboard, and rings a bell when one looks wrong. Nib is a drawing, not a chatbot. Nib does not answer questions or run anything. The calls come from Crowsnest's own checks.",
    'Nib is dry, careful and kind. Nib never jokes about a Hold.',
  ],
  sheetAlt: 'Six drawings of Nib: on watch, looking through a spyglass, nodding, squinting, sitting quietly with a mug, and waving.',
  poses: [
    { pose: 'perch', caption: 'On watch.' },
    { pose: 'spy', caption: 'Looking closely at a new package.' },
    { pose: 'nod', caption: 'Nothing found. Let it aboard.' },
    { pose: 'squint', caption: "Not sure yet. I'll say so." },
    { pose: 'quiet', caption: 'Nothing to report. Time for tea.' },
    { pose: 'wave', caption: 'See you in the docs.' },
  ] as { pose: NibPose; caption: string }[],
} as const;

/** 404, route error and global error. */
export const NOT_FOUND = {
  bubble: 'I checked the whole horizon.',
  title: "That page isn't here.",
  body: 'It may have moved, or the link may be wrong. Try one of these.',
  poseTitle: 'Nib holds a map upside down.',
} as const;

export const ROUTE_ERROR = {
  bubble: 'Something slipped on our side.',
  title: 'Something went wrong.',
  body: "This page didn't load. Try again. If it keeps happening, tell us on GitHub.",
} as const;

export const GLOBAL_ERROR = {
  bubble: "Something slipped. Reload and I'll try again.",
  title: "Crowsnest can't show this page right now.",
  body: "Reload the page. If that doesn't help, come back in a few minutes or tell us on GitHub.",
} as const;
