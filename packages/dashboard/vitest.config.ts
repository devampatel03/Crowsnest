import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Minimal Vitest config for smoke-testing dashboard tab pages. Mirrors the
// "@/*" path alias declared in tsconfig.json and enables a jsdom DOM
// environment for React Testing Library.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
  },
});
