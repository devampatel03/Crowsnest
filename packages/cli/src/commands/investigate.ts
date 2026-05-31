import chalk from 'chalk';
import ora from 'ora';
import { api } from '../api.js';
import { severityColor } from '../display/colors.js';

export async function investigateCommand(
  packageSpec: string,
  opts: { deep?: boolean; ecosystem?: string },
): Promise<void> {
  const [pkgName, version] = packageSpec.includes('@')
    ? [packageSpec.split('@')[0], packageSpec.split('@')[1]]
    : [packageSpec, undefined];

  const ecosystem = opts.ecosystem || 'npm';

  const spinner = ora({
    text: chalk.cyan(`Investigating ${pkgName}${version ? '@' + version : ''}...`),
  }).start();

  let result: Record<string, unknown>;
  try {
    result = await api.investigate(pkgName, version || null, ecosystem);
  } catch (err) {
    spinner.fail(chalk.red(err instanceof Error ? err.message : String(err)));
    process.exit(2);
  }

  spinner.stop();

  console.log();
  console.log(chalk.cyan.bold(`  Investigation: ${pkgName}${version ? '@' + version : ''}`));
  console.log(chalk.dim('  ' + '─'.repeat(50)));

  // npm metadata
  const npm = result.npm_metadata as Record<string, unknown> | undefined;
  if (npm) {
    console.log();
    console.log(chalk.bold('  Package metadata'));
    console.log(`  ${chalk.dim('latest:')}        ${npm.latest_version || 'unknown'}`);
    console.log(`  ${chalk.dim('weekly dl:')}     ${(npm.weekly_downloads as number || 0).toLocaleString()}`);
    console.log(`  ${chalk.dim('maintainers:')}   ${(npm.maintainers as string[] || []).join(', ') || 'none'}`);
    console.log(`  ${chalk.dim('repo:')}          ${npm.repo_url || chalk.red('none')}`);
    console.log(`  ${chalk.dim('install script:')} ${npm.has_install_script ? chalk.red('YES') : chalk.green('no')}`);
  }

  // Socket alerts
  const alerts = result.socket_alerts as Record<string, unknown>[] | undefined;
  if (alerts && alerts.length > 0) {
    console.log();
    console.log(chalk.bold('  Socket.dev alerts'));
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
      console.log(chalk.bold('  Detection query hits'));
      for (const [query, rows] of hitQueries) {
        console.log(`  ${chalk.yellow('⚠')} ${query}: ${rows.length} result(s)`);
      }
    } else {
      console.log();
      console.log(chalk.green('  ✓ No detection queries triggered'));
    }
  }

  console.log();
}
