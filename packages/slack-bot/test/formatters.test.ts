import { describe, it, expect } from 'vitest';
import {
  formatScanResult,
  formatIncidentAlert,
  formatBlastRadius,
  formatInvestigation,
  formatStats,
} from '../src/formatters.js';
import type { Incident, ScanResult, BlastRadiusResult, InvestigationResult, StatsResult } from '../src/types.js';

const inc = (over: Partial<Incident> = {}): Incident => ({
  id: 'inc-1',
  attack_pattern: 'worm',
  confidence: 0.9,
  severity: 'CRITICAL',
  packages: ['evil'],
  blast_radius: 2,
  runtime_confirmation: true,
  remediation_options: ['Pin the version'],
  detected_at: '2026-01-01T00:00:00Z',
  ...over,
});

const scan = (incidents: Incident[]): ScanResult => ({
  scan_id: 's1',
  project_path: '/p',
  status: 'complete',
  incidents,
  packages_scanned: 10,
  duration_ms: 5,
  scanned_at: '2026-01-01T00:00:00Z',
});

const text = (blocks: unknown[]) => JSON.stringify(blocks);

describe('formatScanResult', () => {
  it('clean scan has a success header and the no-incident line', () => {
    const b = formatScanResult(scan([]), '/p');
    expect(text(b)).toContain('No Critical Issues');
    expect(text(b)).toContain('No supply chain incidents');
  });

  it('critical or high triggers action-required header', () => {
    expect(text(formatScanResult(scan([inc({ severity: 'HIGH' })]), '/p'))).toContain('Action Required');
  });

  it('medium only does not trigger action-required', () => {
    expect(text(formatScanResult(scan([inc({ severity: 'MEDIUM' })]), '/p'))).toContain('No Critical Issues');
  });

  it('shows at most 3 incidents, most severe first, plus a remainder note', () => {
    const many = [
      inc({ id: 'a', severity: 'LOW', packages: ['low-pkg'] }),
      inc({ id: 'b', severity: 'CRITICAL', packages: ['crit-pkg'] }),
      inc({ id: 'c', severity: 'MEDIUM', packages: ['med-pkg'] }),
      inc({ id: 'd', severity: 'HIGH', packages: ['high-pkg'] }),
      inc({ id: 'e', severity: 'LOW', packages: ['low2-pkg'] }),
    ];
    const t = text(formatScanResult(scan(many), '/p'));
    expect(t.indexOf('crit-pkg')).toBeLessThan(t.indexOf('high-pkg'));
    expect(t).not.toContain('low-pkg');
    expect(t).toContain('and 2 more incident(s)');
  });

  it('stays within the Slack 50-block cap for large input', () => {
    const many = Array.from({ length: 500 }, (_, i) => inc({ id: String(i) }));
    expect(formatScanResult(scan(many), '/p').length).toBeLessThanOrEqual(50);
  });

  it('always ends with a dashboard button using the supplied url', () => {
    const b = formatScanResult(scan([]), '/p', 'https://dash.example');
    expect(text(b.at(-1)!)).toContain('https://dash.example');
  });

  it('truncates package lists to 3 with a +N more suffix', () => {
    const t = text(formatScanResult(scan([inc({ packages: ['a', 'b', 'c', 'd', 'e'] })]), '/p'));
    expect(t).toContain('+2 more');
  });

  // QA-TE-08: the backend returns blast_radius as a list of objects, but the bot types it as a number.
  it('renders a numeric blast radius even when the API sends a list (QA-TE-08)', () => {
    const apiShaped = inc({ blast_radius: [{ project_path: '/a' }, { project_path: '/b' }] as unknown as number });
    expect(text(formatScanResult(scan([apiShaped]), '/p'))).not.toContain('[object Object]');
  });
});

describe('formatIncidentAlert', () => {
  it('lists string remediations as a numbered list (max 3)', () => {
    const t = text(formatIncidentAlert(inc({ remediation_options: ['one', 'two', 'three', 'four'] })));
    expect(t).toContain('1. one');
    expect(t).toContain('3. three');
    expect(t).not.toContain('4. four');
  });

  it('supports legacy object remediations', () => {
    const t = text(
      formatIncidentAlert(
        inc({ remediation_options: [{ action: 'Pin', description: 'Pin it', reversibility: 'easy', pr_ready: true }] })
      )
    );
    expect(t).toContain('Pin it');
    expect(t).toContain('PR auto-generation');
  });

  it('survives empty remediations and an unknown attack pattern', () => {
    const b = formatIncidentAlert(inc({ remediation_options: [], attack_pattern: 'ioc_match' }));
    expect(text(b)).toContain('ioc_match');
  });

  it('deep-links to the incident log', () => {
    expect(text(formatIncidentAlert(inc(), 'http://d'))).toContain('http://d/log?incident=inc-1');
  });

  it('includes optional description', () => {
    expect(text(formatIncidentAlert(inc({ description: 'Why it matters' })))).toContain('Why it matters');
  });

  it('caps package list at 5', () => {
    const t = text(formatIncidentAlert(inc({ packages: ['1', '2', '3', '4', '5', '6', '7'] })));
    expect(t).toContain('+2 more');
  });
});

const blast = (over: Partial<BlastRadiusResult> = {}): BlastRadiusResult => ({
  maintainer: 'bob',
  compromised_packages: ['p1'],
  affected_projects: ['/proj'],
  affected_packages: ['p1'],
  total_affected: 3,
  runtime_exposed: false,
  risk_score: 0.8,
  ...over,
});

describe('formatBlastRadius', () => {
  it.each([
    [0.8, '🚨'],
    [0.5, '⚠️'],
    [0.1, '✅'],
  ])('risk %s uses emoji %s', (score, emoji) => {
    expect(text(formatBlastRadius('bob', blast({ risk_score: score })))).toContain(emoji);
  });

  it('url-encodes the maintainer in the deep link', () => {
    expect(text(formatBlastRadius('a b&c', blast()))).toContain('maintainer=a%20b%26c');
  });

  it('truncates long package lists to 10', () => {
    const pk = Array.from({ length: 15 }, (_, i) => `pkg${i}`);
    const t = text(formatBlastRadius('bob', blast({ compromised_packages: pk })));
    expect(t).toContain('and 5 more');
    expect(t).not.toContain('pkg14');
  });

  it('handles all-empty result', () => {
    expect(() => formatBlastRadius('bob', blast({ compromised_packages: [], affected_projects: [], risk_score: 0 }))).not.toThrow();
  });
});

const invest = (over: Partial<InvestigationResult> = {}): InvestigationResult => ({
  package: 'x',
  incident: null,
  analysis: {
    maintainer_changes: 0,
    days_since_maintainer_change: null,
    commit_pattern_anomaly: false,
    slsa_attestation: false,
    slsa_pipeline_risk: false,
    socket_alerts: 0,
    weekly_downloads: 1234567,
    age_days: 10,
  },
  verdict: 'clean',
  summary: 'ok',
  ...over,
});

describe('formatInvestigation', () => {
  it('verdict emoji and uppercase verdict', () => {
    expect(text(formatInvestigation('x', invest({ verdict: 'compromised' })))).toContain('COMPROMISED');
    expect(text(formatInvestigation('x', invest({ verdict: 'suspicious' })))).toContain('SUSPICIOUS');
  });

  it('shows pipeline-risk line only when attestation exists', () => {
    expect(text(formatInvestigation('x', invest()))).not.toContain('SLSA pipeline risk');
    const a = invest();
    a.analysis.slsa_attestation = true;
    expect(text(formatInvestigation('x', a))).toContain('SLSA pipeline risk');
  });

  it('renders active incident with string or object remediation', () => {
    expect(text(formatInvestigation('x', invest({ incident: inc() })))).toContain('Pin the version');
    const obj = inc({ remediation_options: [{ action: 'A', description: 'D', reversibility: 'easy' }] });
    expect(text(formatInvestigation('x', invest({ incident: obj })))).toContain('A — D');
  });

  it('url-encodes scoped package names in the Hold link', () => {
    expect(text(formatInvestigation('@s/p', invest()))).toContain('package=%40s%2Fp');
  });
});

const stats = (over: Partial<StatsResult> = {}): StatsResult => ({
  total_packages: 12345,
  total_maintainers: 7,
  active_incidents: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 },
  last_scan_at: null,
  last_scan_project: null,
  ...over,
});

describe('formatStats', () => {
  it('clean state', () => {
    const t = text(formatStats(stats()));
    expect(t).toContain('No active incidents');
    expect(t).toContain('No scans have been run yet');
  });

  it('critical status and counts', () => {
    const t = text(formatStats(stats({ active_incidents: { CRITICAL: 2, HIGH: 0, MEDIUM: 1, LOW: 0 } })));
    expect(t).toContain('🚨');
    expect(t).toContain('*CRITICAL:* 2');
    expect(t).toContain('*Active incidents:* 3');
  });

  it('shows last scan project', () => {
    expect(text(formatStats(stats({ last_scan_at: '2026-01-01T00:00:00Z', last_scan_project: '/p' })))).toContain('/p');
  });
});
