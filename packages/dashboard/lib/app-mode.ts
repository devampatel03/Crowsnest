// Which app this process is.
//
// One build serves two apps, each on its own port:
//   console  the dashboard you use. Opens on Horizon at /, with Lookout, Installed and Log beside it.
//            Port 3000 (`pnpm dev`, `pnpm start`, Docker).
//   site     the public website: landing page, docs, blog, glossary. Port 3001 (`pnpm dev:site`), or Vercel.
//
// CROWSNEST_APP=console selects the dashboard. Anything else is the website, so a public deploy can never
// start as the dashboard by accident.

export type AppMode = 'console' | 'site';

type Env = Record<string, string | undefined>;

export const CONSOLE_PORT = 3000;
export const SITE_PORT = 3001;

export function appMode(env: Env): AppMode {
  return env.CROWSNEST_APP?.trim().toLowerCase() === 'console' ? 'console' : 'site';
}
