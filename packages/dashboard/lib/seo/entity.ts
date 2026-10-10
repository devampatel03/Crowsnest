// Canonical entity strings (02-copy section 1). Imported by the root layout,
// JSON-LD, llms.txt, the About page and the Introduction. Never paraphrase.
// "Supply chain" is unhyphenated (project spelling rule).

export const ENTITY_NAME = 'Crowsnest';

export const ENTITY_DEFINITION =
  'Crowsnest is a free, open-source supply chain security tool that you run yourself: it checks the packages in your software project and tells you, in plain words, which ones to hold back before they cause harm.';

/** Nav tooltip / social card, one use each. */
export const ENTITY_SHORT = 'Free, open-source package checks. You run it yourself.';

/** Who Nib is (02-copy v3 section 1). Used in llms.txt; About carries the longer text. */
export const NIB_SENTENCE =
  "Nib is Crowsnest's mascot, a crow lookout who appears on the website and in the dashboard; Nib is a drawing, not a chatbot.";

export const FOOTER_TAGLINE = 'A lookout for the packages you install.';

// 02-copy section 11 "What it is not". Each is a repo-supported claim.
export const ENTITY_NOT = [
  'Not a tracker of known security bugs. Use Dependabot or Snyk for that; run Crowsnest next to them.',
  'Not a hosted service. There is no account and no cloud dependency; you run it.',
  'Not a firewall. Only installs run as `crowsnest install <package>` are checked; a plain `npm install` is not.',
  'Not able to see an attack that has left no public trace anywhere yet.',
] as const;
