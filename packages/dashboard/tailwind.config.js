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
        background: '#020817',   // slate-950 — deep maritime black
        'surface': '#0f172a',    // slate-900
        'surface-2': '#1e293b',  // slate-800
        primary: {
          DEFAULT: '#22d3ee',    // cyan-400
          dark: '#0891b2',       // cyan-600
        },
        danger: {
          DEFAULT: '#ef4444',    // red-500
          dark: '#dc2626',       // red-600
        },
        warning: {
          DEFAULT: '#fbbf24',    // amber-400
        },
        success: {
          DEFAULT: '#34d399',    // emerald-400
        },
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(239, 68, 68, 0.3)' },
          '100%': { boxShadow: '0 0 20px rgba(239, 68, 68, 0.8)' },
        },
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
