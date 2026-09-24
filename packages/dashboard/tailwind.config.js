/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#05070f',
        surface: '#0b1120',
        'surface-2': '#131b2e',
        'surface-3': '#1c2740',
        border: {
          DEFAULT: '#223049',
          soft: '#182238',
        },
        'text-primary': '#e7ecf7',
        'text-secondary': '#9aa8c7',
        'text-muted': '#8492b0',
        primary: {
          DEFAULT: '#35e6d6',
          400: '#35e6d6',
          500: '#17c9bb',
          300: '#7ff2e6',
        },
        accent: {
          DEFAULT: '#ffb020',
          400: '#ffb020',
          500: '#e0940a',
          300: '#ffd580',
        },
        severity: {
          critical: '#ff4d5e',
          'critical-bg': 'rgba(255,77,94,0.12)',
          'critical-border': 'rgba(255,77,94,0.45)',
          high: '#ff8a3d',
          'high-bg': 'rgba(255,138,61,0.12)',
          'high-border': 'rgba(255,138,61,0.45)',
          medium: '#ffb020',
          'medium-bg': 'rgba(255,176,32,0.12)',
          'medium-border': 'rgba(255,176,32,0.45)',
          low: '#35e6d6',
          'low-bg': 'rgba(53,230,214,0.12)',
          'low-border': 'rgba(53,230,214,0.45)',
        },
        success: '#2fe6a6',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular'],
      },
      borderRadius: {
        lg: '10px',
        xl: '14px',
      },
      boxShadow: {
        panel: '0 1px 0 0 rgba(255,255,255,0.02) inset, 0 8px 24px -12px rgba(0,0,0,0.6)',
        'beacon-glow': '0 0 0 1px rgba(255,176,32,0.4), 0 0 24px 0 rgba(255,176,32,0.25)',
        'cyan-glow': '0 0 0 1px rgba(53,230,214,0.35), 0 0 20px 0 rgba(53,230,214,0.18)',
        'critical-glow': '0 0 0 1px rgba(255,77,94,0.4), 0 0 20px 0 rgba(255,77,94,0.22)',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
