import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Harness, RAW, stubApi } from '@/test/console-harness';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/log' }));

import LogPage from './page';

const ui = () => render(<LogPage />, { wrapper: Harness });
const ROW = /The person who maintains/;

function many(n: number) {
  const base = (RAW.incidents as Record<string, unknown>[])[1];
  return Array.from({ length: n }, (_, i) => ({
    ...base,
    id: `inc-${i}`,
    raw_findings: [{ login: `person${i}` }],
    severity: i % 3 === 0 ? 'MEDIUM' : 'HIGH',
    detected_at: new Date(Date.now() - i * 3600_000).toISOString(),
  }));
}

beforeEach(() => {
  vi.stubGlobal('EventSource', undefined);
  window.history.replaceState(null, '', '/log');
  stubApi();
});

describe('Log', () => {
  it('is one panel of one-line calls that open in place', async () => {
    ui();
    expect(await screen.findByRole('heading', { level: 1, name: 'Everything Crowsnest has called' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(1);
    const rows = await screen.findAllByRole('button', { name: ROW });
    expect(rows).toHaveLength(1);
    fireEvent.click(rows[0]);
    expect(screen.getByRole('button', { name: 'Hide' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }));
    expect(screen.queryByRole('button', { name: 'Hide' })).toBeNull();
  });

  it('filters by seriousness and says so when nothing matches, with a way back', async () => {
    ui();
    await screen.findAllByRole('button', { name: ROW });
    fireEvent.click(screen.getByRole('button', { name: 'Hold' }));
    expect(screen.getByText(/Nothing logged here/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect((await screen.findAllByRole('button', { name: ROW })).length).toBe(1);
  });

  it('searches the plain text, not pattern codes', async () => {
    ui();
    await screen.findAllByRole('button', { name: ROW });
    fireEvent.change(screen.getByLabelText('Search calls'), { target: { value: 'maintainer_takeover' } });
    expect(screen.getByText(/Nothing logged here/)).toBeInTheDocument();
  });

  it('paginates 600 calls', async () => {
    stubApi({ incidents: many(600) });
    ui();
    await screen.findAllByRole('button', { name: ROW });
    expect(screen.getAllByRole('button', { name: ROW })).toHaveLength(25);
    expect(screen.getByText('600 shown')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(within(screen.getByRole('navigation', { name: 'Pages' })).getByText('Page 2')).toBeInTheDocument();
  });

  it('empty state', async () => {
    stubApi({ incidents: [] });
    ui();
    expect(await screen.findByText('Nothing logged yet.')).toBeInTheDocument();
    expect(screen.getByText('Scan a project to start.')).toBeInTheDocument();
  });

  it('error state is one plain sentence', async () => {
    stubApi({ incidents: 'down' });
    ui();
    expect(await screen.findByText("We couldn't reach Crowsnest at http://localhost:8000. Is it running?")).toBeInTheDocument();
  });
});
