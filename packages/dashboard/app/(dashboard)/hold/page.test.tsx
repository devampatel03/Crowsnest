import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Harness, stubApi } from '@/test/console-harness';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/hold' }));

import HoldPage from './page';

const ui = () => render(<HoldPage />, { wrapper: Harness });
const COUNT = '676 shown of 676';

beforeEach(() => {
  vi.stubGlobal('EventSource', undefined);
  window.history.replaceState(null, '', '/hold');
  stubApi();
});

describe('Installed (live fixtures: 1,000 raw rows, 676 real ones)', () => {
  it('prints the count on one line from stats and renders two panels', async () => {
    ui();
    expect(await screen.findByRole('heading', { level: 1, name: 'What is installed' })).toBeInTheDocument();
    expect(await screen.findByText(COUNT)).toBeInTheDocument();
    expect(screen.getByTestId('shown-line').className).toContain('whitespace-nowrap');
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Find a package', 'Held', 'Packages']);
  });

  it('windows the 676 real rows instead of rendering them all', async () => {
    ui();
    await screen.findByText(COUNT);
    expect(within(screen.getByRole('table', { name: 'Packages' })).getAllByRole('row').length).toBeLessThan(80);
    expect(screen.getByRole('table', { name: 'Packages' })).toHaveAttribute('aria-rowcount', '677');
  });

  it('puts flagged packages first, each with a gauge and word', async () => {
    ui();
    await screen.findByText(COUNT);
    const rows = within(screen.getByRole('table', { name: 'Packages' })).getAllByRole('row');
    expect(rows[1]).toHaveTextContent(/Hold/);
    expect(screen.getAllByText('Hold · urgent').length).toBeGreaterThan(0);
  });

  it('opens a detail panel: why it is here, a plain check result, technical lines collapsed', async () => {
    stubApi({
      veto: {
        blocked: true,
        package: 'x',
        version: null,
        probability: 0.9,
        signals: ['Package registered 6 days ago (< 30 days)', 'Only 12 weekly downloads', 'No GitHub repository linked'],
        reason: 'r',
        override_flag: '--x',
      },
    });
    ui();
    await screen.findByText(COUNT);
    fireEvent.click(screen.getAllByRole('button', { name: /show details/ })[0]);
    expect(screen.getByText('Why is this here?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Check this package/ }));
    expect(await screen.findByText('Hold. Crowsnest would stop this install.')).toBeInTheDocument();
    expect(screen.getByText('Registered 6 days ago.')).toBeInTheDocument();
    expect(screen.getByText('Only 12 downloads a week.')).toBeInTheDocument();
    expect(screen.getByText('No link to a code repository.')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/--x|ACTIVE IOC|override/);
  });

  it('checks a typed name with a plain OK result', async () => {
    stubApi({ veto: { blocked: false, package: 'tidy', version: null, probability: 0.3, signals: [], reason: 'none', override_flag: null } });
    ui();
    await screen.findByText(COUNT);
    fireEvent.change(screen.getByLabelText('Check this package'), { target: { value: 'tidy' } });
    fireEvent.click(screen.getByRole('button', { name: /^Check/ }));
    expect(await screen.findByText('OK to install. Nothing unusual found.')).toBeInTheDocument();
  });

  it('filters and says so when nothing matches', async () => {
    ui();
    await screen.findByText(COUNT);
    fireEvent.change(screen.getByLabelText('Search packages'), { target: { value: 'zzzz-not-a-package' } });
    await waitFor(() => expect(screen.getByText('No packages match.')).toBeInTheDocument());
    expect(screen.getByText('0 match')).toBeInTheDocument();
  });

  it('empty state', async () => {
    stubApi({ lockfiles: [] });
    ui();
    expect(await screen.findByText('Nothing aboard yet.')).toBeInTheDocument();
    expect(screen.getByText('Scan a project to list what is installed.')).toBeInTheDocument();
  });

  it('error state is one plain sentence', async () => {
    stubApi({ lockfiles: 'down' });
    ui();
    expect(await screen.findAllByText("We couldn't reach Crowsnest at http://localhost:8000. Is it running?")).toHaveLength(1);
  });
});

describe('Installed: data truth and plain checks', () => {
  it('shows folder names only in the Project column, never a full path', async () => {
    ui();
    await screen.findByText(COUNT);
    expect(document.body.textContent).not.toMatch(/C:\|DEVAM|MY_PROJECTS/i);
  });

  it('hides the ecosystem bar when there is only one ecosystem', async () => {
    ui();
    await screen.findByText(COUNT);
    expect(screen.queryByText(/npm\s*676/)).toBeNull();
    expect(screen.queryByRole('figure')).toBeNull();
  });

  it('a package Crowsnest has no record of reads Unknown, never OK, with no decimals', async () => {
    stubApi({ veto: { blocked: false, package: 'ghostpkg', version: null, probability: 0.2, signals: ['Package not found in Crowsnest database (may be new)'], reason: 'x', override_flag: null } });
    ui();
    await screen.findByText(COUNT);
    fireEvent.change(screen.getByLabelText('Check this package'), { target: { value: 'ghostpkg' } });
    fireEvent.click(screen.getByRole('button', { name: /^Check/ }));
    expect(await screen.findByText('Unknown. Crowsnest has no record of this package, so it cannot call it clear.')).toBeInTheDocument();
    expect(screen.getByText(/allowed with a warning/)).toBeInTheDocument();
    const result = screen.getByText(/allowed with a warning/).closest('[role=status]')!;
    expect(result.textContent).not.toMatch(/OK to install|\d\.\d/);
  });

  it('Flagged only keeps just the packages with a call and explains why they read Hold', async () => {
    ui();
    await screen.findByText(COUNT);
    fireEvent.click(screen.getByRole('button', { name: 'Flagged only' }));
    await waitFor(() => expect(screen.getByText(/ match$/)).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole('button', { name: /show details/ })[0]);
    expect(screen.getByText('Why is it flagged?')).toBeInTheDocument();
    expect(screen.getByText(/every package this maintainer publishes/)).toBeInTheDocument();
  });
});
