import ora from 'ora';
import { api } from '../api.js';
import { theme } from '../display/theme.js';
import { icons } from '../display/icons.js';
import { sectionHeader } from '../display/banner.js';

export async function replayCommand(
  opts: { ioc?: string; date?: string; format?: string },
): Promise<void> {
  if (!opts.ioc) {
    console.error(theme.error('Error: --ioc <name> is required'));
    console.error(theme.muted('  Examples: --ioc shai-hulud-wave-4'));
    console.error(theme.muted('            --ioc tanstack-may11 --date 2026-05-11'));
    process.exit(2);
  }

  const spinner = ora({
    text: theme.brand(`Replaying ${opts.ioc} against Time Machine snapshot${opts.date ? ` (${opts.date})` : ''}...`),
  }).start();

  let result;
  try {
    result = await api.replay(opts.ioc, opts.date);
  } catch (err) {
    spinner.fail(theme.error(err instanceof Error ? err.message : String(err)));
    process.exit(2);
  }

  if (opts.format === 'json') {
    spinner.stop();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  spinner.succeed(theme.success(`Replay complete: ${opts.ioc}`));

  console.log();
  console.log(sectionHeader(`  INCIDENT REPLAY: ${opts.ioc}`));
  if (opts.date) {
    console.log(theme.muted(`  Snapshot: ${opts.date}`));
  }
  console.log();

  const s = result.summary;
  console.log(`  ${theme.brand('IOC records found:')}        ${s.total_iocs}`);
  console.log(`  ${theme.brand('Affected packages:')}        ${s.affected_packages}`);
  console.log(`  ${theme.brand('Your exposed packages:')}    ${s.your_exposed_packages}`);

  if (s.your_exposed_packages > 0) {
    console.log();
    console.log(theme.status.blocked(`  ${icons.warn}  Your environment WAS EXPOSED during this incident`));
    const affected = result.affected_lockfile_entries as Record<string, unknown>[];
    if (affected.length > 0) {
      console.log(theme.muted('  Affected dependencies:'));
      for (const entry of affected.slice(0, 10)) {
        console.log(`    ${icons.dot} ${entry.package}@${entry.version} in ${entry.project_path}`);
      }
    }
    console.log();
    console.log(theme.status.warning('  Recommended actions:'));
    console.log('    1. Rotate all secrets accessible during the affected window');
    console.log('    2. Audit CI logs for data exfiltration attempts');
    console.log('    3. Check runtime_imports table for affected packages');
  } else {
    console.log();
    console.log(theme.success(`  ${icons.ok} Your environment was NOT exposed during this incident`));
  }

  console.log();
}
