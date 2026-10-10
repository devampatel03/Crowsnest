import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Harness, RAW, stubApi } from '@/test/console-harness';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/lookout' }));

import LookoutPage from './page';

const ui = () => render(<LookoutPage />, { wrapper: Harness });
const DOWN = "We couldn't reach Crowsnest at http://localhost:8000. Is it running?";

beforeEach(() => {
  vi.stubGlobal('EventSource', undefined);
  window.history.replaceState(null, '', '/lookout');
  stubApi();
});

describe('Lookout (live fixtures: risk_score arrives as "1.00")', () => {
  it('renders two panels without throwing on string risk scores', async () => {
    ui();
    expect(await screen.findByRole('heading', { level: 1, name: 'Who maintains your packages' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'People who publish your packages' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Selected person' })).toBeInTheDocument();
    expect(await screen.findByRole('listbox')).toBeInTheDocument();
    expect(screen.getByText('Pick a person to see what depends on them.')).toBeInTheDocument();
  });

  it('selects a person and never contradicts itself when the blast query is empty', async () => {
    ui();
    const options = await screen.findAllByRole('option');
    fireEvent.click(options[0]);
    const m = (RAW.maintainers as { login: string; packages_in_graph: number }[])[0];
    expect(await screen.findByText(`Maintains ${m.packages_in_graph} packages in your projects`)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(`Crowsnest knows ${m.login} publishes ${m.packages_in_graph} packages you use, but could not list the projects.`)).toBeInTheDocument());
    expect(screen.queryByText(/No projects of yours depend/)).toBeNull();
    expect(screen.getAllByText(/Flagged: linked to known harmful activity/).length).toBeGreaterThan(0);
  });

  it('lists who else is affected when the blast query answers', async () => {
    stubApi({
      blast: {
        maintainer: 'x',
        packages_controlled: ['ora'],
        affected_projects: ['C:\\work\\app'],
        total_affected_deps: 1,
        blast_radius_entries: [
          { compromised_root: 'ora', our_project: 'C:\\work\\app', affected_dep: 'ora', version: '8.2.0', declared_in: 'direct', parent_chain: [], runtime_status: 'not_observed_at_runtime', last_runtime_load: 'never' },
        ],
        runtime_confirmed_count: 0,
      },
    });
    ui();
    fireEvent.click((await screen.findAllByRole('option'))[0]);
    expect(await screen.findByText('ora 8.2.0')).toBeInTheDocument();
  });

  it('prints a plain error when the API is down', async () => {
    stubApi({ maintainers: 'down' });
    ui();
    expect(await screen.findByText(DOWN)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Failed to fetch/);
  });

  it('says what to do when there are no publishers', async () => {
    stubApi({ maintainers: [] });
    ui();
    expect(await screen.findByText('Nobody to look at yet.')).toBeInTheDocument();
    expect(screen.getByText('Scan a project to see who maintains your packages.')).toBeInTheDocument();
  });
});

describe('Lookout keyboard', () => {
  it('j and k move between people', async () => {
    ui();
    const options = await screen.findAllByRole('option');
    fireEvent.keyDown(document.body, { key: 'j' });
    const first = document.activeElement;
    expect(options).toContain(first);
    fireEvent.keyDown(document.body, { key: 'j' });
    expect(document.activeElement).toBe(options[1]);
    fireEvent.keyDown(document.body, { key: 'k' });
    expect(document.activeElement).toBe(first);
  });

  it('unknown activity reads Unknown, not zero commits', async () => {
    stubApi({ maintainers: [{ login: 'quiet', packages_in_graph: 3, commits_90d: 0, gpg_sign_ratio: 0, repos_touched: 0, days_on_platform: 0, ioc_flagged: false, risk_score: '0.65' }] });
    ui();
    fireEvent.click((await screen.findAllByRole('option'))[0]);
    expect(await screen.findByText('Active: Unknown')).toBeInTheDocument();
    expect(screen.getByText('On the platform: Unknown')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/0 commits/);
  });
});
