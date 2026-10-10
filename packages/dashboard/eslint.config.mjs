import nextConfig from 'eslint-config-next';

// Next.js 16's `next lint` command was removed; `eslint-config-next` now
// ships as a flat-config array consumed directly by `eslint` (v9+).
const config = [
  ...nextConfig,
  {
    ignores: ['.next/**', '.next-*/**', 'out/**', 'next-env.d.ts', '*.tsbuildinfo'],
  },
];

export default config;
