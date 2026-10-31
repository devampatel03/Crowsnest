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
import { backendPath } from '../backend/shared.js';
import { quickChanges } from '../standalone/changes.js';
import { QUICK_NOTE, chooseMode } from '../standalone/mode.js';

export interface CheckOptions {
  base?: string;
  minReleaseAge?: string;
  format?: string;
  /** Use the built-in quick check even when the Crowsnest backend answers. */
  quick?: boolean;
  /** Require the Crowsnest backend; do not fall back to the quick check. */
  full?: boolean;
}

export async function checkCommand(projectPath: string, options: CheckOptions = {}): Promise<void> {
  const minAge = parseMinReleaseAge(options.minReleaseAge);
  const mode = await chooseMode(options);
  const spinner = ora({ text: theme.muted('Checking changed packages...'), color: 'cyan' }).start();

  let report: ChangeReport;
  try {
    report =
      mode === 'full'
        ? await api.checkChanges(await backendPath(projectPath), options.base, minAge)
        : await quickChanges(projectPath, { base: options.base, minReleaseAgeDays: minAge });
  } catch (err) {
    spinner.fail(theme.error('The check could not run'));
    throw err;
  }
  spinner.stop();

  if (options.format === 'json') {
    console.log(JSON.stringify({ mode, ...report }, null, 2));
  } else {
    if (mode === 'quick') console.log(theme.muted(QUICK_NOTE));
    console.log(renderReport(report));
  }
  // Not process.exit(): on Windows it can abort while the lookups' connections are still closing.
  if (report.blocked.length > 0) process.exitCode = 3;
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
