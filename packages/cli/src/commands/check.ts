/**
 * crowsnest check [path] --base <git-ref>
 *
 * Vets the package versions a change adds: those in the project's lockfiles now that were not there at the base
 * ref. Meant for pull requests. Exits 3 when a version should not be merged.
 */

import ora from 'ora';
import { api, ChangeReport } from '../api.js';
import { theme } from '../display/theme.js';
import { icons } from '../display/icons.js';
import { parseMinReleaseAge, iconFor } from './install.js';

export interface CheckOptions {
  base?: string;
  minReleaseAge?: string;
  format?: string;
}

export async function checkCommand(projectPath: string, options: CheckOptions = {}): Promise<void> {
  const minAge = parseMinReleaseAge(options.minReleaseAge);
  const spinner = ora({ text: theme.muted('Checking changed packages...'), color: 'cyan' }).start();

  let report: ChangeReport;
  try {
    report = await api.checkChanges(projectPath, options.base, minAge);
  } catch (err) {
    spinner.fail(theme.error('The check could not run'));
    throw err;
  }
  spinner.stop();

  if (options.format === 'json') {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(renderReport(report));
  }
  if (report.blocked.length > 0) process.exit(3);
}

export function renderReport(report: ChangeReport): string {
  const scope = report.base_ref ? `changed since ${report.base_ref}` : 'in the lockfiles';
  const lines = [theme.muted(`Checked ${report.checked} package version(s) ${scope}.`)];
  for (const r of report.results) {
    const was = r.change === 'updated' ? ` (was ${r.previous_versions.join(', ')})` : '';
    const label = `${r.package}@${r.version ?? '?'}${was}`;
    lines.push(r.blocked ? `${icons.blocked} ${theme.status.blocked(label)}` : `${icons.ok} ${label}`);
    for (const signal of r.blocked || r.signals.length ? r.signals : []) {
      lines.push(`     ${iconFor(signal)}  ${signal}`);
    }
  }
  for (const note of report.degraded) {
    lines.push(`${icons.warn} ${theme.muted(`Not checked: ${note}`)}`);
  }
  lines.push(
    report.blocked.length > 0
      ? theme.status.blocked(`${report.blocked.length} version(s) should not be merged.`)
      : theme.status.approved('Nothing to block.'),
  );
  return lines.join('\n');
}
