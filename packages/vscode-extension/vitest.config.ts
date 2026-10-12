import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    // The real 'vscode' module only exists inside the extension host; tests use a tiny stub.
    alias: { vscode: path.resolve(__dirname, 'test/vscode-stub.ts') },
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    restoreMocks: true,
  },
});
