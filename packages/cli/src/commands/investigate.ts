import ora from 'ora';
import { api } from '../api.js';
import { theme, severityColor } from '../display/theme.js';
import { icons } from '../display/icons.js';
import { sectionHeader } from '../display/banner.js';
import { renderKeyValue } from '../display/table.js';
import { parsePackageSpec } from './install.js';

/** What the backend's install check says about one package; the same answer `crowsnest install` acts on. */
export interface Assessment {
  blocked: boolean;
  probability: number;
  signals: string[];
  reason?: string;
  degraded: string[];
}

export type Call = 'Hold' | 'Watch' | 'Clear' | 'Not fully checked';

/** Hold when the install check blocks it, Watch when it raised anything, and Clear only when nothing was left unchecked. */
export function callFor(a: Assessment): Call {
  if (a.blocked) return 'Hold';
  if (a.signals.length > 0 || a.probability > 0) return 'Watch';
  if (a.degraded.length > 0) return 'Not fully checked';
  return 'Clear';
}

export function readAssessment(raw: unknown): Assessment | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
  return {
    blocked: Boolean(r.blocked),
    probability: Number(r.probability) || 0,
    signals: list(r.signals),
    reason: typeof r.reason === 'string' ? r.reason : undefined,
    degraded: list(r.degraded),
  };
}

export async function investigateCommand(
  packageSpec: string,
  opts: { deep?: boolean; ecosystem?: string },
): Promise<void> {
  const [pkgName, version] = parsePackageSpec(packageSpec);

  const ecosystem = opts.ecosystem || 'npm';

  const spinner = ora({
    text: theme.brand(`Investigating ${pkgName}${version ? '@' + version : ''}...`),
  }).start();

  let result: Record<string, unknown>;
  try {
    result = await api.investigate(pkgName, version || null, ecosystem);
  } catch (err) {
    spinner.fail(theme.error(err instanceof Error ? err.message : String(err)));
    process.exitCode = 2;
    return;
  }

  spinner.succeed(theme.success(`Investigation complete: ${pkgName}${version ? '@' + version : ''}`));

  console.log();
  console.log(sectionHeader(`  Investigation: ${pkgName}${version ? '@' + version : ''}`));

  const assessment = readAssessment(result.assessment);
  if (assessment) {
    const call = callFor(assessment);
    const paint = call === 'Hold' ? theme.error : call === 'Clear' ? theme.success : theme.status.warning;
    console.log();
    console.log(`  ${paint(call)}. Risk ${Math.round(assessment.probability * 100)}%.`);
    for (const s of assessment.signals) console.log(`    ${icons.warn} ${s}`);
    for (const d of assessment.degraded) console.log(`    ${theme.muted('Not checked: ' + d)}`);
    if (call === 'Clear') console.log(theme.muted('    Nothing found by the install check.'));
  }

  const npm = result.npm_metadata as Record<string, unknown> | undefined;
  if (npm) {
    console.log();
    console.log(theme.brand('  Package metadata'));
    console.log(
      renderKeyValue({
        latest: String(npm.latest_version || 'unknown'),
        'weekly dl': ((npm.weekly_downloads as number) || 0).toLocaleString(),
        maintainers: ((npm.maintainers as string[]) || []).join(', ') || 'none',
        repo: String(npm.repo_url || theme.error('none')),
        'install script': npm.has_install_script ? theme.error('YES') : theme.success('no'),
      }),
    );
  }

  const alerts = result.socket_alerts as Record<string, unknown>[] | undefined;
  if (alerts && alerts.length > 0) {
    console.log();
    console.log(theme.brand('  Socket.dev alerts'));
    for (const alert of alerts.slice(0, 5)) {
      const sev = String(alert.severity || 'medium').toUpperCase() as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
      console.log(`  ${severityColor(sev)} ${alert.alert_type} — ${alert.description}`);
    }
  }

  const findings = result.findings as Record<string, unknown[]> | undefined;
  if (findings) {
    const hitQueries = Object.entries(findings).filter(([, rows]) => rows.length > 0);
    if (hitQueries.length > 0) {
      console.log();
      console.log(theme.brand('  Detection query hits'));
      for (const [query, rows] of hitQueries) {
        console.log(`  ${theme.status.warning(icons.warn)} ${query}: ${rows.length} result(s)`);
      }
    } else {
      console.log();
      console.log(theme.muted(`  ${icons.ok} The stored detection queries found nothing for this name. That is extra detail; the call above is the answer.`));
    }
  }

  console.log();
}
