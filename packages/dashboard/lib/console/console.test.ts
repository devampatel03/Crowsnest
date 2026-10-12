import { describe, expect, it } from 'vitest';
import incidentsRaw from '../../test/fixtures/incidents.json';
import lockfilesRaw from '../../test/fixtures/lockfiles.json';
import { normaliseIncident, normaliseIncidents, normaliseLockfiles } from '../api';
import { callFor, compareCalls, countBuckets, headlineFor, howSure, statusSentence } from '../calls';
import { decideKey } from './hotkeys';
import { filterLog, LOG_DEFAULTS, pageCount, pageOf } from './log';
import { compareRows, holdRows, shownLine, whyHere } from './hold';
import { plainSignal, plainVeto } from './veto';
import { INITIAL_SCAN, doneLine, plainScanReason, scanReducer } from '../live/scan';
import { backoffSeconds, statusText } from '../live/machine';
import { clockTime, timeAgo } from '../time';
import { platformAge, whoElse } from '../blast';

const rawIncidents = (incidentsRaw as unknown[]).map(normaliseIncident);
const incidents = normaliseIncidents(incidentsRaw);
const NOW = Date.parse('2026-06-03T12:00:00Z');

describe('calls: plain language from real incidents', () => {
  it('maps takeover to its headline and a Hold urgent gauge', () => {
    const c = callFor(rawIncidents[1]);
    expect(c.headline).toBe('The person who maintains this package changed recently.');
    expect(c).toMatchObject({ level: 'hold', urgent: true, howSure: 'Fairly sure' });
    // fixed plain sentence; the model's prose is kept apart for "More detail"
    expect(c.advice).toEqual(['Stay on the last version from before the change, and look at what the new maintainer changed.']);
    expect(c.moreDetail[0]).toBe('Pin to last known-safe version before maintainer change');
    expect(c.usedIn).toBe('Used in 1 project'); // two drive-letter cases collapse to one project
    expect(c.subject).toMatch(/ \+14 more$/);
    expect(c.who[0].items).toHaveLength(15);
  });
  it('an empty blast radius says Crowsnest could not find, never "none"', () => {
    const c = callFor(rawIncidents[0]);
    expect(c.subject).toBe("sindresorhus's packages");
    expect(c.usedIn).toBe("Crowsnest couldn't find which projects use this.");
  });
  it('no pattern code or decimals leak into any text field', () => {
    for (const i of incidents) {
      const c = callFor(i);
      expect(JSON.stringify([c.headline, c.subject, c.usedIn, c.howSure])).not.toMatch(/maintainer_takeover|0\.95|SQL|JOIN/);
    }
  });
  it('unknown keys fall back, how-sure bands, sentence, sorting', () => {
    expect(headlineFor('zzz')).toBe('Crowsnest found something unusual about this package.');
    expect([howSure(0.9), howSure(0.6), howSure(0.1)]).toEqual(['Very sure', 'Fairly sure', 'Worth a look']);
    expect([statusSentence(0), statusSentence(1), statusSentence(4)]).toEqual(['Nothing needs your attention.', '1 call needs your attention.', '4 calls need your attention.']);
    const sorted = [{ ...rawIncidents[0], severity: 'MEDIUM' as const }, { ...rawIncidents[1], severity: 'CRITICAL' as const }].sort(compareCalls);
    expect(sorted[0].severity).toBe('CRITICAL');
    expect(countBuckets([{ severity: 'HIGH' }, { severity: 'CRITICAL' }, { severity: 'MEDIUM' }, { severity: 'LOW' }])).toEqual({ hold: 2, watch: 1, note: 1 });
  });
});

describe('time', () => {
  const ago = (ms: number) => new Date(NOW - ms).toISOString();
  it('relative words', () => {
    expect(timeAgo(ago(10_000), NOW)).toBe('just now');
    expect(timeAgo(ago(5 * 60_000), NOW)).toBe('5 minutes ago');
    expect(timeAgo(ago(3600_000), NOW)).toBe('an hour ago');
    expect(timeAgo(ago(3 * 3600_000), NOW)).toBe('3 hours ago');
    expect(timeAgo(ago(30 * 3600_000), NOW)).toBe('yesterday');
    expect(timeAgo(ago(3 * 86_400_000), NOW)).toBe('3 days ago');
    expect(timeAgo('2026-05-12T12:00:00Z', NOW + 40 * 86_400_000)).toBe('12 May 2026');
    expect(timeAgo('garbage', NOW)).toBe('');
  });
  it('clock', () => {
    expect(clockTime(new Date(2026, 5, 3, 14, 14))).toBe('2:14 pm');
  });
});

describe('log filtering', () => {
  it('worst first, severity toggles, text search on plain words, date range', () => {
    expect(filterLog(incidents, LOG_DEFAULTS)).toHaveLength(1);
    expect(filterLog(incidents, { ...LOG_DEFAULTS, v: 'watch,note' })).toHaveLength(0);
    expect(filterLog(incidents, { ...LOG_DEFAULTS, q: 'maintains' })).toHaveLength(1);
    expect(filterLog(incidents, { ...LOG_DEFAULTS, q: 'maintainer_takeover' })).toHaveLength(0);
    expect(filterLog(incidents, { ...LOG_DEFAULTS, from: '2030-01-01' })).toHaveLength(0);
    expect(filterLog(incidents, { ...LOG_DEFAULTS, from: '2030-01-01', to: '2020-01-01' })).toHaveLength(1); // bad range is ignored
  });
  it('pages', () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(600)).toBe(24);
    expect(pageOf('99', 600)).toBe(24);
    expect(pageOf('x', 600)).toBe(1);
  });
});

describe('hold rows from the real lockfiles', () => {
  const rows = holdRows(normaliseLockfiles(lockfilesRaw), incidents);
  it('keys are unique even though the backend repeats rows', () => {
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });
  it('flagged packages sort first', () => {
    const sorted = [...rows].sort(compareRows);
    expect(sorted[0].rank).toBeLessThan(4);
    expect(sorted[sorted.length - 1].rank).toBe(4);
  });
  it('count line and why-here sentences', () => {
    expect(shownLine(676, 676, false)).toBe('676 shown of 676');
    expect(shownLine(1000, 1352, false)).toBe('1,000 shown of 1,352');
    expect(shownLine(12, 1352, true)).toBe('12 match');
    expect(shownLine(5, null, false)).toBe('5 shown of 5');
    expect(whyHere({ declared_in: 'direct', parent_chain: [] })).toBe('You added this directly.');
    expect(whyHere({ declared_in: 'transitive', parent_chain: ['a', 'b'] })).toBe('Brought in by a › b.');
  });
});

describe('check this install', () => {
  it('translates every backend signal into one plain sentence', () => {
    expect(plainSignal('Package registered 6 days ago (< 30 days)')).toBe('Registered 6 days ago.');
    expect(plainSignal('Only 1,200 weekly downloads')).toBe('Only 1,200 downloads a week.');
    expect(plainSignal('No GitHub repository linked')).toBe('No link to a code repository.');
    expect(plainSignal('Package not found in Crowsnest database (may be new)')).toBe('Crowsnest has no record of this package. It may be new.');
    expect(plainSignal('Matches known AI hallucination pattern (confidence: 80%)')).toBe('AI assistants are known to invent this name.');
    expect(plainSignal('ACTIVE IOC: shai-hulud — wave 2')).toBe('This package is on a list of known harmful packages.');
    expect(plainSignal('Socket.dev alert: installScripts')).toBe('Socket has raised an alert about this package.');
    expect(plainSignal("Typosquat risk: similar to 'lodash' (50,000,000 downloads)")).toBe('Its name is very close to lodash, which has 50,000,000 downloads a week.');
    expect(plainSignal('something new')).toBe('Crowsnest noticed something unusual about this package.');
  });
  it('headline wording', () => {
    const base = { package: 'p', version: null, signals: [], reason: '', override_flag: null };
    expect(plainVeto({ ...base, blocked: false, probability: 0.3 }).headline).toBe('OK to install. Nothing unusual found.');
    expect(plainVeto({ ...base, blocked: true, probability: 0.9 }).headline).toBe('Hold. Crowsnest would stop this install.');
    const unknown = plainVeto({ ...base, blocked: false, probability: 0.2, signals: ['Package not found in Crowsnest database (may be new)'] });
    expect(unknown.level).toBe('unknown');
    expect(unknown.headline).toBe('Unknown. Crowsnest has no record of this package, so it cannot call it clear.');
    expect(unknown.reasons).toEqual([]);
  });
});

describe('who else is affected and maintainer facts', () => {
  const m = { login: 'sindresorhus', packages_in_graph: 37 };
  it('never contradicts: "none" only when nothing is in the graph', () => {
    expect(whoElse(undefined, m)).toEqual({ kind: 'none', text: 'Crowsnest knows sindresorhus publishes 37 packages you use, but could not list the projects.' });
    expect(whoElse(undefined, { ...m, packages_in_graph: 0 })).toEqual({ kind: 'none', text: 'No projects of yours depend on packages from sindresorhus.' });
  });
  it('age wording', () => {
    expect([platformAge(0), platformAge(10), platformAge(200), platformAge(1500)]).toEqual(['Unknown', 'New this month', '6 months', '4 years']);
  });
});

describe('scan lifecycle shows no phases', () => {
  it('submit, accepted, event complete, done line', () => {
    let s = scanReducer(INITIAL_SCAN, { type: 'submit', path: '/p' });
    s = scanReducer(s, { type: 'accepted', scanId: 'a' });
    s = scanReducer(s, { type: 'event', scanId: 'a', phase: 'ingestion_complete' });
    expect(s.phase).toBe('running');
    s = scanReducer(s, { type: 'event', scanId: 'b', phase: 'complete', found: 9 });
    expect(s.phase).toBe('running'); // another scan's event is ignored
    s = scanReducer(s, { type: 'event', scanId: 'a', phase: 'complete', found: 2 });
    expect(s).toMatchObject({ phase: 'complete', found: 2 });
    expect(doneLine(2)).toBe('Done. 2 packages need your attention.');
    expect(doneLine(0)).toBe('Done. Nothing needs your attention.');
  });
  it('failures become plain reasons', () => {
    expect(plainScanReason('No such file or directory: /x')).toMatch(/can't find that folder/);
    expect(plainScanReason('{"detail":"That folder does not exist."}')).toMatch(/can't find that folder/);
    expect(plainScanReason('{"detail":"No supported lockfile in that folder (go.sum)."}')).toMatch(/no lockfile Crowsnest can read/);
    expect(plainScanReason('Traceback (most recent call last)')).toBe('Check the folder and try again.');
  });
});

describe('connection status and keys', () => {
  it('one status string, no countdown', () => {
    expect(statusText('live', null)).toBe('Live. Nothing new.');
    expect(statusText('live', null, new Date(2026, 5, 3, 14, 14).getTime())).toBe('Live. Last event 2:14 pm.');
    expect(statusText('reconnecting', null)).toBe('Reconnecting…');
    expect(statusText('offline', new Date(2026, 5, 3, 14, 14).getTime())).toBe('Offline. Showing data from 2:14 pm.');
    expect(statusText('reconnecting', null)).not.toMatch(/\d/);
    expect([1, 2, 3, 4, 5, 9].map(backoffSeconds)).toEqual([1, 2, 4, 8, 16, 16]);
  });
  it('keys ignore modifiers and typing', () => {
    const ctx = { typing: false, dialogOpen: false, chordOpen: false, singleKeys: true };
    const k = (key: string, mods = {}) => ({ key, ctrlKey: false, metaKey: false, altKey: false, ...mods });
    expect(decideKey(k('j'), ctx)).toEqual({ kind: 'row', dir: 1 });
    expect(decideKey(k('k'), ctx)).toEqual({ kind: 'row', dir: -1 });
    expect(decideKey(k('/'), ctx)).toEqual({ kind: 'filter' });
    expect(decideKey(k('x'), ctx)).toEqual({ kind: 'none' });
    expect(decideKey(k('j', { ctrlKey: true }), ctx)).toEqual({ kind: 'none' });
    expect(decideKey(k('j'), { ...ctx, typing: true })).toEqual({ kind: 'none' });
    expect(decideKey(k('l'), { ...ctx, chordOpen: true })).toEqual({ kind: 'goto', href: '/lookout' });
    expect(decideKey(k('j'), { ...ctx, singleKeys: false })).toEqual({ kind: 'none' });
    expect(decideKey(k('?'), { ...ctx, singleKeys: false })).toEqual({ kind: 'help' });
  });
});
