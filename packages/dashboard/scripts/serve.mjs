// Starts one of the two apps in this build, each on its own port (lib/app-mode.ts).
//
//   node scripts/serve.mjs console dev     the dashboard, http://localhost:3000
//   node scripts/serve.mjs console start   the dashboard from a production build
//   node scripts/serve.mjs site dev        the public website, http://localhost:3001
//   node scripts/serve.mjs site start      the website from a production build
//
// PORT overrides the port. The website's dev server writes to .next-site so both dev servers can run at once.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const PORTS = { console: '3000', site: '3001' };
const [app, command] = process.argv.slice(2);

if (!(app in PORTS) || !['dev', 'start'].includes(command)) {
  console.error('Usage: node scripts/serve.mjs <console|site> <dev|start>');
  process.exit(2);
}

const env = { ...process.env, CROWSNEST_APP: app };
if (app === 'site' && command === 'dev' && !env.NEXT_DIST_DIR) env.NEXT_DIST_DIR = '.next-site';
const port = env.PORT || PORTS[app];

const next = createRequire(import.meta.url).resolve('next/dist/bin/next');
const child = spawn(process.execPath, [next, command, '-p', port], { stdio: 'inherit', env });

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
