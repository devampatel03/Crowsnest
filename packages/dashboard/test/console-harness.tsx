import type { ReactNode } from 'react';
import { vi } from 'vitest';
import { SWRConfig } from 'swr';
import { ConsoleLiveProvider } from '@/components/console/ConsoleLiveProvider';
import { ScanDialog } from '@/components/console/ScanDialog';
import { ScanProvider } from '@/components/console/ScanProvider';
import { ShortcutProvider } from '@/components/console/ShortcutProvider';
import { Surface, ToastProvider } from '@/components/system';
import incidentsJson from './fixtures/incidents.json';
import lockfilesJson from './fixtures/lockfiles.json';
import maintainersJson from './fixtures/maintainers.json';
import statsJson from './fixtures/stats.json';

/** Real payloads captured from the live API (GET only). Tests render pages from these. */
export const RAW = {
  incidents: incidentsJson as unknown,
  lockfiles: lockfilesJson as unknown,
  maintainers: maintainersJson as unknown,
  stats: statsJson as unknown,
};

/** Same provider order as ConsoleShell, with an isolated SWR cache and no polling. */
export function Harness({ children }: { children: ReactNode }) {
  return (
    <Surface>
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, errorRetryCount: 0, refreshInterval: 0 }}>
        <ToastProvider>
          <ConsoleLiveProvider>
            <ScanProvider>
              <ShortcutProvider>
                <main>{children}</main>
                <ScanDialog />
              </ShortcutProvider>
            </ScanProvider>
          </ConsoleLiveProvider>
        </ToastProvider>
      </SWRConfig>
    </Surface>
  );
}

type Routes = Partial<Record<'incidents' | 'lockfiles' | 'maintainers' | 'stats' | 'blast' | 'veto', unknown>>;

/**
 * Stubs `fetch` so the real `lib/api.ts` (and its normalisers) run against
 * captured JSON. Pass overrides per route; pass `'down'` to make fetch reject
 * like an unreachable server, or a number to answer with that HTTP status.
 */
export function stubApi(over: { [K in keyof Routes]?: Routes[K] | 'down' | number } = {}) {
  const table: Record<string, unknown> = { ...RAW, blast: { maintainer: '', packages_controlled: [], affected_projects: [], total_affected_deps: 0, blast_radius_entries: [], runtime_confirmed_count: 0 }, ...over };
  const calls: string[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    calls.push(`${init?.method ?? 'GET'} ${u}`);
    const key = u.includes('/api/incidents')
      ? 'incidents'
      : u.includes('/api/lockfiles')
        ? 'lockfiles'
        : u.includes('/api/maintainers')
          ? 'maintainers'
          : u.includes('/api/stats')
            ? 'stats'
            : u.includes('/api/blast-radius')
              ? 'blast'
              : u.includes('/api/veto')
                ? 'veto'
                : '';
    const v = table[key];
    if (v === 'down') throw new TypeError('Failed to fetch');
    if (typeof v === 'number') return new Response('nope', { status: v });
    return new Response(JSON.stringify(v ?? {}), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fn);
  return { fetch: fn, calls };
}
