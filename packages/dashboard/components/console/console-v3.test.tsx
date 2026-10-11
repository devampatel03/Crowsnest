import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Harness, RAW, stubApi } from '@/test/console-harness';

let path = '/horizon';
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => path }));

import HoldPage from '@/app/(dashboard)/hold/page';
import HorizonPage from '@/app/(dashboard)/horizon/page';
import LogPage from '@/app/(dashboard)/log/page';
import { HOLD_SAFE, horizonNote, holdNote, horizonPose, LOG_NOTE, LOOKOUT_NOTE } from '@/lib/console/notes';
import { ConsoleHeader } from './ConsoleHeader';
import { Rail } from './Rail';

/** A controllable EventSource: tests open it and push real-shaped events. */
class FakeES {
  static last: FakeES | null = null;
  onopen: (() => void) | null = null;
  onmessage: ((m: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    FakeES.last = this;
  }
  close() {}
  open() {
    this.onopen?.();
  }
  emit(o: object) {
    this.onmessage?.({ data: JSON.stringify(o) });
  }
  fail() {
    this.onerror?.();
  }
}

beforeEach(() => {
  path = '/horizon';
  FakeES.last = null;
  vi.stubGlobal('EventSource', undefined);
  stubApi();
  window.history.replaceState(null, '', '/horizon');
});
afterEach(() => vi.unstubAllGlobals());

const inc = RAW.incidents as Record<string, unknown>[];
/** Three real-shaped calls on different days: g1 and g2 are identical; g3 has one extra package. */
function groupedCalls() {
  const base = inc[2] as { packages: string[] };
  return [
    { ...inc[2], id: 'g1', detected_at: '2026-05-29T10:00:00+00:00' },
    { ...inc[2], id: 'g2', detected_at: '2026-05-25T10:00:00+00:00' },
    { ...inc[2], id: 'g3', detected_at: '2026-05-27T10:00:00+00:00', packages: [...base.packages, 'one-more-package'] },
  ];
}

describe('Nib notes (copy deck 9.2)', () => {
  it('only uses whitelisted lines when a Hold is showing', () => {
    expect(horizonNote({ loaded: true, scanned: true, hold: 2, watch: 1 })).toBe('Start with the first one.');
    expect(HOLD_SAFE).toContain(horizonNote({ loaded: true, scanned: true, hold: 1, watch: 0 }));
    expect(HOLD_SAFE).toContain(holdNote(true));
    expect(HOLD_SAFE).toContain(LOOKOUT_NOTE);
    expect(HOLD_SAFE).toContain(LOG_NOTE);
  });
  it('says nothing before the first scan or while loading, and picks the right pose', () => {
    expect(horizonNote({ loaded: true, scanned: false, hold: 0, watch: 0 })).toBeNull();
    expect(horizonNote({ loaded: false, scanned: true, hold: 0, watch: 0 })).toBeNull();
    expect(horizonPose({ loaded: true, scanned: true, hold: 0, watch: 0 })).toBe('perch');
    expect(horizonPose({ loaded: true, scanned: true, hold: 0, watch: 2 })).toBe('squint');
    expect(horizonPose({ loaded: true, scanned: true, hold: 1, watch: 0 })).toBe('spy');
    expect(horizonPose({ loaded: true, scanned: false, hold: 0, watch: 0 })).toBeNull();
    expect(holdNote(false)).toBe('This is everything on board.');
  });
  it('is one line in the hand face under the one h1 on every page', async () => {
    render(<HorizonPage />, { wrapper: Harness });
    await screen.findByRole('heading', { level: 1, name: /need/ });
    const note = screen.getByText('Start with the first one.');
    expect(note.className).toContain('nib-voice');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});

describe('Horizon: grouped Calls', () => {
  it('folds identical calls into one card and keeps a different package set as its own card', async () => {
    stubApi({ incidents: groupedCalls() });
    render(<HorizonPage />, { wrapper: Harness });
    expect(await screen.findByRole('heading', { level: 1, name: '3 calls need your attention.' })).toBeInTheDocument();
    expect(document.querySelectorAll('[id^="call-"]')).toHaveLength(2);
    expect(screen.getAllByText('Also found 1 more time.')).toHaveLength(1);
    expect(screen.getByRole('link', { name: /See each in Log/ })).toHaveAttribute('href', '/log');
  });

  it('never adds the line when nothing is identical', async () => {
    stubApi({ incidents: [groupedCalls()[0], groupedCalls()[2]] });
    render(<HorizonPage />, { wrapper: Harness });
    await screen.findByRole('heading', { level: 1, name: '2 calls need your attention.' });
    expect(document.querySelectorAll('[id^="call-"]')).toHaveLength(2);
    expect(screen.queryByText(/Also found/)).toBeNull();
  });

  it('call cards carry no Nib art, no hand face and no joke', async () => {
    stubApi({ incidents: groupedCalls() });
    render(<HorizonPage />, { wrapper: Harness });
    await screen.findByRole('heading', { level: 1, name: /need/ });
    for (const card of document.querySelectorAll('[id^="call-"]')) {
      expect(card.querySelector('svg.nib, .nib-voice, [data-nib-note]')).toBeNull();
    }
  });

  it('shows Nib spy beside the status while a Hold is showing, and no cameo caption in the chart', async () => {
    render(<HorizonPage />, { wrapper: Harness });
    await screen.findByRole('heading', { level: 1, name: /need/ });
    expect(document.querySelector('[data-status-nib="spy"]')).not.toBeNull();
    expect(screen.queryByText('A quiet month.')).toBeNull();
  });
});

describe('Horizon: first run', () => {
  const empty = { ...(RAW.stats as object), total_packages: 0, table_counts: {}, last_scan_at: null, total_incidents: 0 };

  it('shows the three-panel strip, no note and no status Nib, and its action opens the Scan dialog', async () => {
    stubApi({ incidents: [], stats: empty });
    render(<HorizonPage />, { wrapper: Harness });
    expect(await screen.findByRole('heading', { level: 1, name: 'No project scanned yet.' })).toBeInTheDocument();
    const strip = screen.getByRole('figure', { name: 'Point me at a folder' });
    expect(within(strip).getAllByRole('listitem')).toHaveLength(3);
    expect(within(strip).getByText("The horizon's empty.")).toBeInTheDocument();
    expect(within(strip).getByText('Point me at a folder. I read its lockfile.')).toBeInTheDocument();
    expect(within(strip).getByText("Then I'll tell you what needs you.")).toBeInTheDocument();
    expect(document.querySelector('[data-status-nib]')).toBeNull();
    expect(document.querySelector('[data-nib-note]')).toBeNull();
    // the strip replaces the two panels
    expect(screen.queryByRole('heading', { level: 2, name: 'Needs your attention' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Scan a project/ }));
    expect(await screen.findByLabelText('Project folder')).toBeInTheDocument();
  });

  it('never shows once a scan exists, even with nothing to report', async () => {
    stubApi({ incidents: [], stats: { ...empty, last_scan_at: '2026-06-01T10:00:00+00:00' } });
    render(<HorizonPage />, { wrapper: Harness });
    await screen.findByRole('heading', { level: 1, name: 'All quiet from up here.' });
    expect(screen.queryByRole('figure', { name: 'Point me at a folder' })).toBeNull();
  });

  it('never shows when packages are known, with no timestamp', async () => {
    stubApi({ incidents: [] });
    render(<HorizonPage />, { wrapper: Harness });
    await screen.findByRole('heading', { level: 1, name: 'All quiet from up here.' });
    expect(screen.queryByRole('figure', { name: 'Point me at a folder' })).toBeNull();
  });
});

describe('illustrated states', () => {
  it('offline on Horizon: lantern Nib, one line, the plain sentence, both ways forward', async () => {
    stubApi({ incidents: 'down', stats: 'down' });
    render(<HorizonPage />, { wrapper: Harness });
    expect((await screen.findAllByText("My lantern's out.")).length).toBeGreaterThan(0);
    expect(document.querySelector('[data-state="offline"] svg[data-pose="lantern"]')).not.toBeNull();
    expect(screen.getAllByText("We couldn't reach Crowsnest at http://localhost:8000. Is it running?").length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'How to start it' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Try again' }).length).toBeGreaterThan(0);
  });

  it('a server error on Horizon uses the oops pose and no pun', async () => {
    stubApi({ incidents: 500 });
    render(<HorizonPage />, { wrapper: Harness });
    await screen.findByText('Something slipped on our side.');
    expect(document.querySelector('[data-state="error"] svg[data-pose="oops"]')).not.toBeNull();
  });

  it('the Hold page never draws Nib for an error, a flagged detail or its shelf', async () => {
    stubApi({ lockfiles: 'down' });
    const { unmount } = render(<HoldPage />, { wrapper: Harness });
    await screen.findByText("We couldn't reach Crowsnest at http://localhost:8000. Is it running?");
    expect(document.querySelector('svg.nib')).toBeNull();
    expect(screen.queryByText("My lantern's out.")).toBeNull();
    unmount();

    stubApi();
    render(<HoldPage />, { wrapper: Harness });
    await screen.findByText(/shown of/);
    expect(screen.getByText('The held ones are first.')).toBeInTheDocument();
    const shelf = document.querySelector('[data-held-shelf]')!;
    expect(shelf.querySelectorAll('li').length).toBeGreaterThan(0);
    expect(shelf.querySelectorAll('li').length).toBeLessThanOrEqual(3);
    fireEvent.click(screen.getAllByRole('button', { name: /show details/ })[0]);
    await screen.findByText('Why is this here?');
    expect(document.querySelector('svg.nib, [data-pose]')).toBeNull();
  });

  it('Hold search with no results: a Hold on the page means a plain sentence, no Nib line', async () => {
    render(<HoldPage />, { wrapper: Harness });
    await screen.findByText(/shown of/);
    fireEvent.change(screen.getByLabelText('Search packages'), { target: { value: 'zzzz-not-a-package' } });
    expect(await screen.findByText('No packages match.')).toBeInTheDocument();
    expect(screen.queryByText('No package by that name aboard.')).toBeNull();
  });

  it('Hold search with no results and nothing held: squint cameo', async () => {
    stubApi({ incidents: [] });
    render(<HoldPage />, { wrapper: Harness });
    await screen.findByText(/shown of/);
    fireEvent.change(screen.getByLabelText('Search packages'), { target: { value: 'zzzz-not-a-package' } });
    expect(await screen.findByText('No package by that name aboard.')).toBeInTheDocument();
    expect(document.querySelector('svg[data-pose="squint"]')).not.toBeNull();
    expect(screen.getByText('This is everything on board.')).toBeInTheDocument();
  });

  it('Horizon with nothing in the last month and no Hold: the quiet cameo and its caption', async () => {
    stubApi({ incidents: [] });
    render(<HorizonPage />, { wrapper: Harness });
    expect(await screen.findByText('A quiet month.')).toBeInTheDocument();
    expect(document.querySelector('[data-testid="daily-empty"] svg[data-pose="quiet"]')).not.toBeNull();
  });
});

describe('Log: rope timeline', () => {
  const day = 86_400_000;
  // "Today" is a local calendar day, so pin the clock to midday: "2 hours ago" must not land on
  // yesterday when the suite happens to run just after midnight. Only Date is faked, so findBy* still polls.
  const noon = new Date(2026, 9, 10, 12, 0, 0).getTime();
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: noon });
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  const at = (ms: number) => new Date(Date.now() - ms).toISOString();
  const makeCalls = () => [
    { ...inc[2], id: 'a', detected_at: at(2 * 3600_000), raw_findings: [{ login: 'p1' }] },
    { ...inc[2], id: 'b', detected_at: at(3 * day), raw_findings: [{ login: 'p2' }] },
    { ...inc[2], id: 'c', detected_at: at(40 * day), raw_findings: [{ login: 'p3' }] },
  ];

  it('groups newest first under Today, This week and Earlier with one knot per call', async () => {
    path = '/log';
    window.history.replaceState(null, '', '/log');
    stubApi({ incidents: makeCalls() });
    render(<LogPage />, { wrapper: Harness });
    await screen.findByRole('heading', { level: 3, name: 'Today' });
    const heads = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(heads).toEqual(['Today', 'This week', 'Earlier']);
    expect(screen.getAllByRole('heading', { level: 3 }).every((h) => h.className.includes('text-h3') && !h.className.includes('nib-voice'))).toBe(true);
    const tl = document.querySelector('[data-rope-timeline]')!;
    expect(tl.querySelector('[data-rope]')).not.toBeNull();
    expect(tl.querySelectorAll('[data-knot="major"]')).toHaveLength(3);
    expect(screen.getByText('Newest first.')).toBeInTheDocument();
  });

  it('empty and filtered-empty use the quiet cameo with the copy deck lines', async () => {
    path = '/log';
    window.history.replaceState(null, '', '/log');
    stubApi({ incidents: [] });
    const { unmount } = render(<LogPage />, { wrapper: Harness });
    expect(await screen.findByText('Nothing logged yet.')).toBeInTheDocument();
    expect(document.querySelector('svg[data-pose="quiet"]')).not.toBeNull();
    unmount();
    stubApi({ incidents: makeCalls() });
    render(<LogPage />, { wrapper: Harness });
    await screen.findByRole('heading', { level: 3, name: 'Today' });
    fireEvent.change(screen.getByLabelText('Search calls'), { target: { value: 'zzzzzz' } });
    expect(screen.getByText(/Nothing logged here\. Clear the filters and I'll look again\./)).toBeInTheDocument();
  });
});

describe('Shell: Heartbeat, status and the lantern', () => {
  const shell = () =>
    render(
      <>
        <ConsoleHeader />
        <Rail />
      </>,
      { wrapper: Harness },
    );

  beforeEach(() => vi.stubGlobal('EventSource', FakeES));

  it('is flat and honest when quiet, and moves only on real scan and incident events', async () => {
    shell();
    act(() => FakeES.last!.open());
    expect(await screen.findByText('Live. Nothing new.')).toBeInTheDocument();
    const hb = await screen.findByTestId('heartbeat');
    expect(hb).toHaveAttribute('aria-label', 'No events in the last minute.');
    // events the backend uses for its demo task, and the connect hello, never count
    act(() => {
      FakeES.last!.emit({ type: 'publish_event', timestamp: new Date().toISOString() });
      FakeES.last!.emit({ type: 'connected', timestamp: new Date().toISOString() });
    });
    expect(screen.getByText('Live. Nothing new.')).toBeInTheDocument();
    act(() => {
      FakeES.last!.emit({ type: 'incident_detected', id: 'm1', severity: 'MEDIUM', attack_pattern: 'worm', timestamp: new Date().toISOString() });
    });
    expect(screen.getByText(/^Live\. Last event \d{1,2}:\d{2} (am|pm)\.$/)).toBeInTheDocument();
    expect(screen.getByTestId('heartbeat').getAttribute('aria-label')).toMatch(/^1 event in the last minute/);
  });

  it('lights the lantern when connected and puts it out when the stream drops', async () => {
    shell();
    act(() => FakeES.last!.open());
    const lamp = await screen.findByRole('img', { name: 'Connected. Crowsnest is live.' });
    expect(lamp.querySelector('[data-rail-lantern="lit"]')).not.toBeNull();
    act(() => FakeES.last!.fail());
    const dark = await screen.findByRole('img', { name: 'Disconnected. Crowsnest is offline.' });
    expect(dark.querySelector('[data-rail-lantern="unlit"]')).not.toBeNull();
    expect(screen.getByText('Reconnecting…')).toBeInTheDocument();
  });
});

describe('Toasts and the Scan dialog', () => {
  beforeEach(() => vi.stubGlobal('EventSource', FakeES));

  it('a Hold toast carries no art and persists; an info toast carries the mini crow', async () => {
    render(<HorizonPage />, { wrapper: Harness });
    act(() => FakeES.last!.open());
    act(() => {
      FakeES.last!.emit({ type: 'incident_detected', id: 'h1', severity: 'CRITICAL', attack_pattern: 'maintainer_takeover', timestamp: new Date().toISOString() });
    });
    const hold = await screen.findByRole('alert');
    expect(hold).toHaveTextContent('New Hold:');
    expect(hold.querySelector('[data-toast-icon], svg')).toBeNull();
  });

  it('runs a scan with the spy, then nods when nothing was found', async () => {
    render(<HorizonPage />, { wrapper: Harness });
    act(() => FakeES.last!.open());
    fireEvent.keyDown(document.body, { key: 's' });
    fireEvent.change(await screen.findByLabelText('Project folder'), { target: { value: '/some/project' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Scan$/ }));
    });
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Checking your packages…')).toBeInTheDocument();
    expect(dialog.querySelector('svg[data-pose="spy"]')).not.toBeNull();
    // the start toast carries the mini crow
    expect(document.querySelector('[data-toast-icon] svg')).not.toBeNull();
    act(() => {
      FakeES.last!.emit({ type: 'scan_progress', phase: 'complete', incidents_found: 0, timestamp: new Date().toISOString() });
    });
    expect(await within(dialog).findByText('Done. Nothing needs your attention.')).toBeInTheDocument();
    expect(within(dialog).getByText('Nothing to hold.')).toBeInTheDocument();
    expect(dialog.querySelector('svg[data-pose="nod"]')).not.toBeNull();
  });

  it('with findings the spy stays steady and there is no Nib line', async () => {
    render(<HorizonPage />, { wrapper: Harness });
    act(() => FakeES.last!.open());
    fireEvent.keyDown(document.body, { key: 's' });
    fireEvent.change(await screen.findByLabelText('Project folder'), { target: { value: '/some/project' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Scan$/ }));
    });
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Checking your packages…');
    act(() => {
      FakeES.last!.emit({ type: 'scan_progress', phase: 'complete', incidents_found: 2, timestamp: new Date().toISOString() });
    });
    expect(await within(dialog).findByText('Done. 2 packages need your attention.')).toBeInTheDocument();
    expect(within(dialog).queryByText('Nothing to hold.')).toBeNull();
    expect(dialog.querySelector('svg[data-pose="spy"]')).not.toBeNull();
    expect(within(dialog).getByRole('link', { name: /See them/ })).toBeInTheDocument();
  });
});
