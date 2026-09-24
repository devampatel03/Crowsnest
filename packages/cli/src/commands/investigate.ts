import ora from 'ora';
import { api } from '../api.js';
import { theme, severityColor } from '../display/theme.js';
import { icons } from '../display/icons.js';
import { sectionHeader } from '../display/banner.js';
import { renderKeyValue } from '../display/table.js';

export async function investigateCommand(
  packageSpec: string,
  opts: { deep?: boolean; ecosystem?: string },
): Promise<void> {
  const [pkgName, version] = packageSpec.includes('@')
    ? [packageSpec.split('@')[0], packageSpec.split('@')[1]]
    : [packageSpec, undefined];

  const ecosystem = opts.ecosystem || 'npm';

  const spinner = ora({
    text: theme.brand(`Investigating ${pkgName}${version ? '@' + version : ''}...`),
  }).start();

  let result: Record<string, unknown>;
  try {
    result = await api.investigate(pkgName, version || null, ecosystem);
  } catch (err) {
    spinner.fail(theme.error(err instanceof Error ? err.message : String(err)));
    process.exit(2);
  }

  spinner.succeed(theme.success(`Investigation complete: ${pkgName}${version ? '@' + version : ''}`));

  console.log();
  console.log(sectionHeader(`  Investigation: ${pkgName}${version ? '@' + version : ''}`));

  // npm metadata
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

  // Socket alerts
  const alerts = result.socket_alerts as Record<string, unknown>[] | undefined;
  if (alerts && alerts.length > 0) {
    console.log();
    console.log(theme.brand('  Socket.dev alerts'));
    for (const alert of alerts.slice(0, 5)) {
      const sev = String(alert.severity || 'medium').toUpperCase() as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
      console.log(`  ${severityColor(sev)} ${alert.alert_type} — ${alert.description}`);
    }
  }

  // Findings from detection queries
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
      console.log(theme.success(`  ${icons.ok} No detection queries triggered`));
    }
  }

  console.log();
}
