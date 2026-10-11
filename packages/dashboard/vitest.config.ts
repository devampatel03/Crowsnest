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
    // These tests render whole console pages in jsdom. They take ~0.5 s on an idle machine but
    // several seconds on a loaded CI runner, so the 5 s default makes them flaky.
    testTimeout: 20_000,
  },
});
