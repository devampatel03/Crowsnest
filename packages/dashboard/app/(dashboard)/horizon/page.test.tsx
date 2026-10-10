import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Harness, RAW, stubApi } from '@/test/console-harness';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }), usePathname: () => '/horizon' }));

import HorizonPage from './page';

const ui = () => render(<HorizonPage />, { wrapper: Harness });
const key = (k: string) => fireEvent.keyDown(document.body, { key: k });
const BANNED = /\b(SQL|JOIN|template|pipeline|firehose|sightline|snapshot|replay|MAINTAINER_TAKEOVER|maintainer_takeover|hackathon)\b/i;
const HEADLINE = 'The person who maintains this package changed recently.';

/** The fixture's first incident, re-attributed to other people so they are different calls. */
function withOthers(n: number) {
  const base = (RAW.incidents as Record<string, unknown>[])[1] as { raw_findings: Record<string, unknown>[] };
  const extra = Array.from({ length: n }, (_, i) => ({ ...base, id: `x-${i}`, raw_findings: [{ ...base.raw_findings[0], login: `other${i}` }] }));
  return [...(RAW.incidents as unknown[]), ...extra];
}

beforeEach(() => {
  vi.stubGlobal('EventSource', undefined);
  push.mockReset();
  stubApi();
});

describe('Horizon (rendered from the live fixtures)', () => {
  it('shows one status sentence, three numerals and a plain Call card', async () => {
    ui();
    expect(await screen.findByRole('heading', { level: 1, name: '1 call needs your attention.' })).toBeInTheDocument();
    const counts = screen.getByRole('region', { name: 'Counts' });
    expect(within(counts).getByText('Hold')).toBeInTheDocument();
    expect(within(counts).getByText('Watch')).toBeInTheDocument();
    expect(within(counts).getByText('Packages checked')).toBeInTheDocument();
    expect(within(counts).getByText('676')).toBeInTheDocument();
    // the four identical raw incidents are one call
    expect(screen.getAllByText(HEADLINE)).toHaveLength(1);
    expect(screen.getAllByText('Hold · urgent').length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(BANNED);
    expect(document.body.textContent).not.toMatch(/0\.95|\d{4}-\d{2}-\d{2}T/);
  });

  it('writes What to do from the fixed plain map, with raw prose only behind More detail', async () => {
    ui();
    await screen.findByRole('heading', { level: 1, name: /need/ });
    expect(screen.getByText('Stay on the last version from before the change, and look at what the new maintainer changed.')).toBeInTheDocument();
    expect(screen.queryByText(/Immediately audit|Pin to last known-safe/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show steps' }));
    expect(screen.getByText('More detail')).toBeInTheDocument();
    expect(screen.getByText(/Pin to last known-safe version/)).toBeInTheDocument();
  });

  it('shows project folder names only, never a full path', async () => {
    ui();
    await screen.findByRole('heading', { level: 1, name: /need/ });
    fireEvent.click(screen.getByRole('button', { name: 'Show steps' }));
    expect(screen.getByText('Crowsnest')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/C:\\|DEVAM|MY_PROJECTS/i);
  });

  it('the card count and the who-else list agree', async () => {
    ui();
    await screen.findByRole('heading', { level: 1, name: /need/ });
    expect(screen.getByText(/\+14 more/)).toBeInTheDocument(); // 15 affected packages of yours
    fireEvent.click(screen.getByRole('button', { name: 'Show steps' }));
    expect(screen.getByText(/and 9 more/)).toBeInTheDocument(); // 6 listed + 9
    expect(screen.getByRole('button', { name: 'Show all 15' })).toBeInTheDocument();
  });

  it('has exactly one h1 and three panels', async () => {
    ui();
    await screen.findByRole('heading', { level: 1, name: /need/ });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 2, name: 'Needs your attention' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Last 30 days' })).toBeInTheDocument();
  });

  it('collapses the chart to one plain line when the latest call is months old', async () => {
    ui();
    await screen.findByRole('heading', { level: 1, name: /need/ });
    expect(screen.getByText(/No new calls in the last 30 days\. Latest: 31 May 2026\./)).toBeInTheDocument();
    expect(screen.queryByRole('figure')).toBeNull();
  });

  it('counts calls, not raw incidents: three people means three calls', async () => {
    stubApi({ incidents: withOthers(2) });
    ui();
    expect(await screen.findByRole('heading', { level: 1, name: '3 calls need your attention.' })).toBeInTheDocument();
  });

  it('says what it checked when nothing needs attention', async () => {
    stubApi({ incidents: [] });
    ui();
    expect(await screen.findByRole('heading', { level: 1, name: 'All quiet from up here.' })).toBeInTheDocument();
    expect(screen.getByText('Nib checked 676 packages and found nothing to hold.')).toBeInTheDocument();
    expect(screen.getByText('Nothing to hold, as far as I can see.')).toBeInTheDocument();
    // clear: Nib perches beside the status, and the quiet month is drawn in the chart panel
    expect(document.querySelector('[data-status-nib="perch"]')).not.toBeNull();
    expect(screen.getByText('A quiet month.')).toBeInTheDocument();
  });

  it('says no project is scanned yet and offers the scan', async () => {
    stubApi({ incidents: [], stats: { ...(RAW.stats as object), total_packages: 0, table_counts: {} } });
    ui();
    expect(await screen.findByText('No project scanned yet.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Scan a project/ }).length).toBeGreaterThan(0);
  });

  it('prints one plain error when the API is down, never raw fetch text', async () => {
    stubApi({ incidents: 'down', stats: 'down' });
    ui();
    expect(await screen.findAllByText("We couldn't reach Crowsnest at http://localhost:8000. Is it running?")).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: /How to start it/ }).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/Failed to fetch|API 5\d\d/);
  });

  it('keeps unknown pattern keys readable', async () => {
    const raw = (RAW.incidents as Record<string, unknown>[]).map((i) => ({ ...i, attack_pattern: 'brand_new_thing' }));
    stubApi({ incidents: raw });
    ui();
    expect((await screen.findAllByText('Crowsnest found something unusual about this package.')).length).toBe(1);
  });
});

describe('Horizon keyboard', () => {
  it('? opens the shortcut sheet and Esc closes it', async () => {
    ui();
    await screen.findByRole('heading', { level: 1, name: /need/ });
    key('?');
    const d = await screen.findByRole('dialog');
    expect(d).toHaveTextContent('Keyboard shortcuts');
    expect(d).toHaveTextContent('j / k');
    expect(within(d).getAllByText('then')).toHaveLength(4);
    expect(d).not.toHaveTextContent(/j then k/i);
    fireEvent.keyDown(d, { key: 'Escape' });
  });

  it('s opens the scan dialog with a plain field and a stated reason while empty', async () => {
    ui();
    await screen.findByRole('heading', { level: 1, name: /need/ });
    key('s');
    const input = await screen.findByLabelText('Project folder');
    expect(input).toHaveAttribute('placeholder', '/path/to/project');
    expect(screen.getByText('Enter a folder to scan.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Scan/ })).toBeDisabled();
    expect(screen.queryByText(/phase|token|ingest/i)).toBeNull();
  });

  it('g then l goes to Lookout; g then o to Installed', async () => {
    ui();
    await screen.findByRole('heading', { level: 1, name: /need/ });
    key('g');
    key('l');
    expect(push).toHaveBeenCalledWith('/lookout');
    key('g');
    key('o');
    expect(push).toHaveBeenCalledWith('/hold');
  });

  it('j moves focus down the call cards and k back up', async () => {
    stubApi({ incidents: withOthers(2) });
    ui();
    await screen.findByRole('heading', { level: 1, name: /need/ });
    key('j');
    const first = document.activeElement as HTMLElement;
    expect(first).toHaveTextContent('Show steps');
    key('j');
    expect(document.activeElement).not.toBe(first);
    key('k');
    expect(document.activeElement).toBe(first);
  });

  it('single keys do nothing while typing', async () => {
    ui();
    await screen.findByRole('heading', { level: 1, name: /need/ });
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: 's' });
    expect(screen.queryByLabelText('Project folder')).toBeNull();
    input.remove();
  });
});
