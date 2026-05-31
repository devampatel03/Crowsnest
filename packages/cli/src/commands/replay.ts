import chalk from 'chalk';
import ora from 'ora';
import { api } from '../api.js';

export async function replayCommand(
  opts: { ioc?: string; date?: string; format?: string },
): Promise<void> {
  if (!opts.ioc) {
    console.error(chalk.red('Error: --ioc <name> is required'));
    console.error(chalk.dim('  Examples: --ioc shai-hulud-wave-4'));
    console.error(chalk.dim('            --ioc tanstack-may11 --date 2026-05-11'));
    process.exit(2);
  }

  const spinner = ora({
    text: chalk.cyan(`Replaying ${opts.ioc} against Time Machine snapshot${opts.date ? ` (${opts.date})` : ''}...`),
  }).start();

  let result;
  try {
    result = await api.replay(opts.ioc, opts.date);
  } catch (err) {
    spinner.fail(chalk.red(err instanceof Error ? err.message : String(err)));
    process.exit(2);
  }

  spinner.stop();

  if (opts.format === 'json') {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log();
  console.log(chalk.cyan.bold(`  INCIDENT REPLAY: ${opts.ioc}`));
  if (opts.date) {
    console.log(chalk.dim(`  Snapshot: ${opts.date}`));
  }
  console.log(chalk.dim('  ' + '─'.repeat(52)));
  console.log();

  const s = result.summary;
  console.log(`  ${chalk.cyan('IOC records found:')}        ${s.total_iocs}`);
  console.log(`  ${chalk.cyan('Affected packages:')}        ${s.affected_packages}`);
  console.log(`  ${chalk.cyan('Your exposed packages:')}    ${s.your_exposed_packages}`);

  if (s.your_exposed_packages > 0) {
    console.log();
    console.log(chalk.red.bold('  ⚠  Your environment WAS EXPOSED during this incident'));
    const affected = result.affected_lockfile_entries as Record<string, unknown>[];
    if (affected.length > 0) {
      console.log(chalk.dim('  Affected dependencies:'));
      for (const entry of affected.slice(0, 10)) {
        console.log(`    • ${entry.package}@${entry.version} in ${entry.project_path}`);
      }
    }
    console.log();
    console.log(chalk.yellow('  Recommended actions:'));
    console.log('    1. Rotate all secrets accessible during the affected window');
    console.log('    2. Audit CI logs for data exfiltration attempts');
    console.log('    3. Check runtime_imports table for affected packages');
  } else {
    console.log();
    console.log(chalk.green('  ✓ Your environment was NOT exposed during this incident'));
  }

  console.log();
}
