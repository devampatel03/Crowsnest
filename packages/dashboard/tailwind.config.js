/** @type {import('tailwindcss').Config} */
// Crowsnest "Paper" theme: one fixed light theme. Every colour is a CSS variable defined in app/globals.css.
// No shadows, gradients, pills or blur exist in this theme on purpose: those
// utilities are removed, not hidden. Radius pair: 6px controls, 12px panels.
const v = (name) => `var(--${name})`;
const SANS = ['var(--font-sans)', 'system-ui', 'sans-serif'];
const MONO = ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'];
const HAND = ['var(--font-hand)', 'ui-rounded', 'cursive'];
const DISPLAY = ['var(--font-display)', 'Georgia', "'Times New Roman'", 'serif'];

module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './content/**/*.mdx',
    './lib/**/*.{js,ts,jsx,tsx}',
    './mdx-components.tsx',
  ],
  theme: {
    // Breakpoints per brief: 375 / 768 / 1024 / 1280 / 1920. There is no `sm`.
    screens: {
      xs: '375px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1920px',
    },
    // Radius: controls 0.375rem, panels 0.75rem, gauge notches 2px. Nothing else, no pills.
    borderRadius: {
      none: '0px',
      DEFAULT: '0.375rem',
      ctl: '0.375rem',
      panel: '0.75rem',
      notch: '2px',
      knot: '50%', // rope knots only
    },
    // No shadows, no gradients, no blur.
    boxShadow: { none: 'none' },
    dropShadow: {},
    backgroundImage: { none: 'none' },
    blur: {},
    backdropBlur: {},
    colors: {
      transparent: 'transparent',
      current: 'currentColor',

      // Semantic, surface-aware. Components use ONLY these.
      canvas: v('c-canvas'),
      surface: v('c-surface'),
      raised: v('c-raised'),
      pressed: v('c-pressed'),
      input: v('c-input'),
      fg: v('c-fg'),
      'fg-soft': v('c-fg-soft'),
      'fg-mute': v('c-fg-mute'),
      rule: v('c-line'), // hairline, decorative separators only
      'rule-strong': v('c-line-strong'),
      field: v('c-field'), // control borders (UI boundary, >= 3:1)
      brand: v('c-brand'), // the beam
      'brand-hi': v('c-brand-hi'),
      'on-brand': v('c-on-brand'),
      cta: v('c-cta'), // signal yellow: primary buttons, the mascot
      'cta-hi': v('c-cta-hi'),
      'cta-lo': v('c-cta-lo'),
      'on-cta': v('c-on-cta'),
      rope: v('c-rope'),
      'rope-dark': v('c-rope-dark'),
      hold: v('c-hold'), // the alarm; nothing else uses it
      watch: v('c-watch'),
      clear: v('c-clear'),
      'diff-add': v('c-diff-add'),
      backdrop: v('c-backdrop'),
      'nib-line': v('c-nib-line'), // mascot outline
      'nib-fill': v('c-nib-fill'), // mascot body fill, decorative
    },
    extend: {
      fontFamily: {
        sans: SANS,
        mono: MONO,
        display: DISPLAY,
        serif: DISPLAY,
        hand: HAND, // Patrick Hand: Nib's voice only
      },
      // Type scale: fluid between mobile and desktop values;
      // line-height, tracking and weight travel with each role. Family is set
      // by the component (`font-display` for the serif roles, `font-mono` for
      // stat-m and bearing); the .label / .stat-* / .bearing classes in
      // globals.css bundle the family with the size.
      fontSize: {
        'display-xl': ['clamp(3.25rem, 7.2vw, 6rem)', { lineHeight: '0.98', letterSpacing: '-0.02em', fontWeight: '400' }],
        'display-l': ['clamp(2.5rem, 5vw, 4rem)', { lineHeight: '1', letterSpacing: '-0.02em', fontWeight: '400' }],
        'display-m': ['clamp(2rem, 3.4vw, 2.75rem)', { lineHeight: '1.05', letterSpacing: '-0.015em', fontWeight: '400' }],
        h2: ['clamp(1.375rem, 2.2vw, 1.625rem)', { lineHeight: '1.2', letterSpacing: '-0.015em', fontWeight: '600' }],
        h3: ['clamp(1.0625rem, 1.5vw, 1.125rem)', { lineHeight: '1.3', letterSpacing: '-0.005em', fontWeight: '600' }],
        'body-l': ['clamp(1.0625rem, 1.5vw, 1.1875rem)', { lineHeight: '1.6', letterSpacing: '0' }],
        body: ['1rem', { lineHeight: '1.65', letterSpacing: '0' }],
        prose: ['clamp(1rem, 1.4vw, 1.0625rem)', { lineHeight: '1.7', letterSpacing: '0' }],
        'body-s': ['0.875rem', { lineHeight: '1.5', letterSpacing: '0' }],
        label: ['0.8125rem', { lineHeight: '1.3', letterSpacing: '0.01em', fontWeight: '500' }],
        code: ['0.875rem', { lineHeight: '1.65', letterSpacing: '0' }],
        // Italic serif answer-first lead (one per article). It is larger than
        // body-l because a condensed serif needs more size.
        lead: ['clamp(1.25rem, 2vw, 1.5rem)', { lineHeight: '1.4', letterSpacing: '-0.005em', fontWeight: '400' }],
        'stat-xl': ['clamp(4.5rem, 10vw, 7.5rem)', { lineHeight: '0.95', letterSpacing: '-0.02em', fontWeight: '400' }],
        'stat-l': ['clamp(2.75rem, 4.6vw, 3.5rem)', { lineHeight: '1', letterSpacing: '-0.02em', fontWeight: '400' }],
        'stat-m': ['1.375rem', { lineHeight: '1.1', letterSpacing: '-0.01em', fontWeight: '500' }],
        'hand-m': ['1.3125rem', { lineHeight: '1.25', letterSpacing: '0', fontWeight: '400' }],
        'hand-s': ['1.0625rem', { lineHeight: '1.3', letterSpacing: '0', fontWeight: '400' }],
        bearing: ['0.6875rem', { lineHeight: '1.2', letterSpacing: '0.04em', fontWeight: '400' }],
      },
      // Tracking utilities named after the roles that own them.
      letterSpacing: {
        'display-xl': '-0.02em',
        'display-l': '-0.02em',
        'display-m': '-0.015em',
        h2: '-0.015em',
        h3: '-0.005em',
        label: '0.01em',
        bearing: '0.04em',
        'stat-xl': '-0.02em',
        'stat-l': '-0.02em',
        'stat-m': '-0.01em',
      },
      // Spacing scale 4 / 8 / 12 / 20 / 32 / 52 / 84 / 136 as s1..s8. The
      // default Tailwind scale stays available for pixel-exact work.
      spacing: {
        s1: '0.25rem',
        s2: '0.5rem',
        s3: '0.75rem',
        s4: '1.25rem',
        s5: '2rem',
        s6: '3.25rem',
        s7: '5.25rem',
        s8: '8.5rem',
        header: '3.75rem', // public site header
        'console-header': '3.5rem',
        rail: '5.25rem',
        'rail-open': '11rem',
      },
      strokeWidth: { chart: '2.25', line: '1.5', nib: '2.25' },
      maxWidth: {
        shell: '70rem',
        docs: '75rem',
        prose: '68ch',
      },
      width: {
        'docs-nav': '15rem',
        'docs-toc': '12.5rem',
      },
      transitionDuration: {
        ui: '160ms',
        overlay: '200ms',
        gauge: '420ms',
        reveal: '700ms',
        draw: '520ms',
        bell: '600ms',
        wave: '900ms',
      },
      transitionTimingFunction: {
        lookout: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)', // bell and crow landing only
      },
      opacity: { 45: '0.45' },
      // Prose for docs / blog / glossary: Instrument Sans 17/1.7 at 68ch.
      // Links are the beam colour (brand colour), code is DM Mono.
      typography: () => ({
        DEFAULT: {
          css: {
            '--tw-prose-body': v('c-fg-soft'),
            '--tw-prose-headings': v('c-fg'),
            '--tw-prose-lead': v('c-fg-soft'),
            '--tw-prose-links': v('c-brand'),
            '--tw-prose-bold': v('c-fg'),
            '--tw-prose-counters': v('c-fg-mute'),
            '--tw-prose-bullets': v('c-fg-mute'),
            '--tw-prose-hr': v('c-line'),
            '--tw-prose-quotes': v('c-fg'),
            '--tw-prose-quote-borders': v('c-line-strong'),
            '--tw-prose-captions': v('c-fg-mute'),
            '--tw-prose-code': v('c-fg'),
            '--tw-prose-pre-code': v('c-fg'),
            '--tw-prose-pre-bg': v('c-raised'),
            '--tw-prose-th-borders': v('c-line-strong'),
            '--tw-prose-td-borders': v('c-line'),
            maxWidth: '68ch',
            fontSize: '1.0625rem',
            lineHeight: '1.7',
            letterSpacing: '0',
            a: {
              textDecoration: 'underline',
              textUnderlineOffset: '0.25rem',
              textDecorationThickness: '1px',
              fontWeight: '500',
            },
            'h2, h3, h4': { fontFamily: 'var(--font-sans), system-ui, sans-serif' },
            h2: { fontSize: 'clamp(1.375rem, 2.2vw, 1.625rem)', lineHeight: '1.2', letterSpacing: '-0.015em', fontWeight: '600', marginTop: '2.2em', marginBottom: '0.7em' },
            h3: { fontSize: '1.125rem', lineHeight: '1.3', letterSpacing: '-0.005em', fontWeight: '600', marginTop: '1.8em', marginBottom: '0.5em' },
            code: {
              fontFamily: 'var(--font-mono), ui-monospace, monospace',
              fontSize: '0.88em',
              fontWeight: '400',
              padding: '0.1em 0.35em',
              backgroundColor: v('c-raised'),
              border: `1px solid ${v('c-line')}`,
              borderRadius: '0.375rem',
            },
            'code::before': { content: 'none' },
            'code::after': { content: 'none' },
            pre: { borderRadius: '0.375rem', border: `1px solid ${v('c-line')}`, fontSize: '0.875rem', lineHeight: '1.65' },
            'pre code': { border: '0', padding: '0', backgroundColor: 'transparent', fontSize: 'inherit' },
            kbd: { fontFamily: 'var(--font-mono), ui-monospace, monospace', fontWeight: '400' },
            figcaption: { fontFamily: 'var(--font-sans), system-ui, sans-serif' },
            blockquote: { fontStyle: 'normal', fontWeight: '400', borderLeftWidth: '1px' },
            'blockquote p:first-of-type::before': { content: 'none' },
            'blockquote p:last-of-type::after': { content: 'none' },
            table: { fontSize: '0.875rem' },
            'thead th': { fontSize: '0.8125rem', letterSpacing: '0.01em', fontWeight: '500', color: v('c-fg-mute') },
            hr: { marginTop: '3em', marginBottom: '3em' },
          },
        },
      }),
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
