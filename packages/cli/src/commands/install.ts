/**
 * crowsnest install <package>[@version]
 *
 * Checks the exact version npm would install against Crowsnest and stops before `npm install` when it is listed as
 * malware, looks hijacked, is younger than the minimum release age, or its risk is above the veto threshold.
 * What is checked is what is installed: the version is resolved first and passed to npm.
 */

import { execFile, spawn } from 'child_process';
import ora from 'ora';
import { api, VetoResult } from '../api.js';
import { theme } from '../display/theme.js';
import { icons } from '../display/icons.js';
import { banner } from '../display/banner.js';

export interface InstallOptions {
  acknowledgeRisk?: boolean;
  /** Days a version must have been public. Unset uses the server's setting; 0 turns the rule off. */
  minReleaseAge?: string;
  /** Refuse to install when the Crowsnest API cannot be reached, instead of installing unchecked. */
  strict?: boolean;
}

export async function installCommand(
  packageSpec: string,
  options: InstallOptions = {},
): Promise<void> {
  const [pkgName, requested] = parsePackageSpec(packageSpec);
  if (!isSafePackageSpec(pkgName, requested)) {
    // The name and version are handed to npm through a shell on Windows, so only plain characters are allowed.
    console.error(theme.error(`"${packageSpec}" is not a package name and version Crowsnest can check.`));
    console.error(theme.muted('Use a name such as left-pad or @scope/name, with an optional version such as @1.2.3 or @^1.2.0.'));
    process.exit(2);
  }
  const minAge = parseMinReleaseAge(options.minReleaseAge);

  const spinner = ora({
    text: theme.muted(`Checking ${pkgName} before install...`),
    color: 'cyan',
  }).start();

  // Resolve to the single version npm would pick, so the version that is checked is the version that is installed.
  const version = (await resolveVersion(pkgName, requested)) ?? (isExactVersion(requested) ? requested : undefined);

  let result: VetoResult;
  try {
    result = await api.vetoCheck(pkgName, version, 'npm', minAge);
  } catch {
    if (options.strict) {
      spinner.fail(theme.error('Crowsnest API unreachable — not installing (--strict)'));
      console.log(theme.muted('Start the API, or run without --strict to install unchecked.'));
      process.exit(3);
    }
    spinner.fail(theme.error('Crowsnest API unreachable — proceeding without veto check'));
    console.log(theme.muted('Start the API with: uvicorn packages.core.api:app --reload'));
    await runNpmInstall(packageSpec);
    return;
  }

  const target = installTarget(pkgName, requested, result.version);

  if (result.blocked) {
    spinner.fail(theme.status.blocked(`Blocked: ${result.package}${result.version ? '@' + result.version : ''}`));
    renderBlockScreen(result);
    if (options.acknowledgeRisk) {
      const probPct = Math.round(result.probability * 100);
      console.log(
        theme.status.warning(
          `${icons.warn} Proceeding despite blocked risk score ${probPct}% — acknowledged via --crowsnest-acknowledge-risk`,
        ),
      );
      console.log();
      await runNpmInstall(target);
      return;
    }
    process.exit(3);
  } else {
    spinner.succeed(theme.status.approved(`Approved: ${result.package}${result.version ? '@' + result.version : ''}`));
    renderApprovalScreen(result);
    await runNpmInstall(target);
  }
}

function renderBlockScreen(result: VetoResult): void {
  const probPct = Math.round(result.probability * 100);

  const lines: string[] = [`${icons.blocked} BLOCKED: ${result.package}${result.version ? '@' + result.version : ''}`, ''];

  for (const signal of result.signals) {
    lines.push(`  ${iconFor(signal)}  ${signal}`);
  }
  for (const note of result.degraded ?? []) {
    lines.push(`  ${icons.info}  Not checked: ${note}`);
  }

  lines.push('');
  lines.push(`  Risk score:  ${probPct}%`);

  if (result.override_flag) {
    lines.push('');
    lines.push(`  To override (risk accepted):`);
    lines.push(`    crowsnest install ${result.package}${result.version ? '@' + result.version : ''} ${result.override_flag}`);
  }

  console.log();
  console.log(banner(lines, { tone: 'blocked' }));
  console.log();
}

function renderApprovalScreen(result: VetoResult): void {
  const probPct = Math.round(result.probability * 100);

  const lines: string[] = [`${icons.ok} APPROVED: ${result.package}${result.version ? '@' + result.version : ''}`];

  for (const signal of result.signals) {
    lines.push(`  ${icons.info}  ${signal}`);
  }
  for (const note of result.degraded ?? []) {
    lines.push(`  ${icons.warn}  Not checked: ${note}`);
  }

  lines.push(`  Risk score: ${probPct}%`);

  console.log();
  console.log(banner(lines, { tone: 'approved' }));
  console.log();
  console.log(theme.muted('Proceeding with installation...'));
}

export function iconFor(signal: string): string {
  return signal.includes('IOC') ? icons.critical :
    signal.includes('hijacked') ? icons.critical :
    signal.includes('published') && signal.includes('policy') ? icons.calendar :
    signal.includes('hallucination') ? icons.bot :
    signal.includes('days ago') ? icons.calendar :
    signal.includes('downloads') ? icons.trendDown :
    signal.includes('repository') ? icons.link :
    signal.includes('Typosquat') ? icons.mask : icons.warn;
}

async function runNpmInstall(packageSpec: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['install', packageSpec], {
      stdio: 'inherit',
      shell: true,
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`npm install exited with code ${code}`));
      }
    });
    child.on('error', reject);
  });
}

/** What to hand to npm: the version that was checked, never a range or tag that could resolve differently. */
export function installTarget(pkgName: string, requested: string | undefined, checked: string | null): string {
  if (checked) return `${pkgName}@${checked}`;
  return requested ? `${pkgName}@${requested}` : pkgName;
}

export function parsePackageSpec(spec: string): [string, string | undefined] {
  if (spec.startsWith('@')) {
    // scoped: @org/pkg@version
    const rest = spec.slice(1);
    const atIdx = rest.indexOf('@');
    if (atIdx >= 0) {
      return [`@${rest.slice(0, atIdx)}`, rest.slice(atIdx + 1)];
    }
    return [spec, undefined];
  }
  const atIdx = spec.lastIndexOf('@');
  if (atIdx > 0) {
    return [spec.slice(0, atIdx), spec.slice(atIdx + 1)];
  }
  return [spec, undefined];
}

const EXACT_VERSION = /^v?\d+(\.\d+){0,3}([-+][0-9A-Za-z.+-]+)?$/;
const PACKAGE_NAME = /^(@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/;
const SAFE_SPEC = /^[A-Za-z0-9._^~*+-]+$/;

/** A valid npm package name, and a version or range made only of characters that mean nothing to a shell. */
export function isSafePackageSpec(pkgName: string, spec: string | undefined): boolean {
  return PACKAGE_NAME.test(pkgName) && (spec === undefined || SAFE_SPEC.test(spec));
}

export function isExactVersion(spec: string | undefined): spec is string {
  return Boolean(spec && EXACT_VERSION.test(spec.trim()));
}

export function parseMinReleaseAge(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const days = Number(value);
  if (!Number.isFinite(days) || days < 0 || days > 365) {
    throw new Error('--min-release-age must be a number of days from 0 to 365');
  }
  return days;
}

/** Highest exact version in `npm view <spec> version --json` output (a string, or a list when a range matches many). */
export function pickVersion(output: string): string | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    return undefined;
  }
  const versions = (Array.isArray(parsed) ? parsed : [parsed]).filter(
    (v): v is string => typeof v === 'string' && isExactVersion(v),
  );
  return versions.at(-1);
}

/** Ask npm which version `pkg@spec` resolves to. Undefined when npm cannot say (offline, unknown package). */
export function resolveVersion(pkgName: string, spec: string | undefined): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile(
      'npm',
      ['view', `${pkgName}@${spec ?? 'latest'}`, 'version', '--json'],
      { shell: process.platform === 'win32', timeout: 20000 },
      (error, stdout) => resolve(error ? undefined : pickVersion(String(stdout))),
    );
  });
}
