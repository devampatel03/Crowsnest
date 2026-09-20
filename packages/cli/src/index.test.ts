import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);

// index.ts runs `program.parseAsync(process.argv)` at module top-level, so it
// cannot be safely `import`-ed in-process during a test run (it would parse
// Vitest's own argv). Instead we spawn it via tsx --help, the same way `npm
// run dev` invokes it, and assert on the registered command surface.
describe('CLI command parsing (sanity)', () => {
  it('registers all expected top-level commands and exits cleanly on --help', async () => {
    const entry = path.resolve(__dirname, 'index.ts');
    const { stdout } = await execFileAsync(
      process.execPath,
      [require.resolve('tsx/cli'), entry, '--help'],
      { cwd: path.resolve(__dirname, '..') },
    );

    for (const cmd of ['scan', 'investigate', 'blast-radius', 'replay', 'watch', 'install', 'config']) {
      expect(stdout).toContain(cmd);
    }
  }, 30000);
});
