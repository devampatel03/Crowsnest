/**
 * crowsnest install <package>[@version]
 *
 * Pre-install veto hook — the demo's stopping moment.
 * Checks the package against Crowsnest before running npm install.
 */

import { spawn } from 'child_process';
import ora from 'ora';
import { api, VetoResult } from '../api.js';
import { theme } from '../display/theme.js';
import { icons } from '../display/icons.js';
import { banner } from '../display/banner.js';

export interface InstallOptions {
  acknowledgeRisk?: boolean;
}

export async function installCommand(
  packageSpec: string,
  options: InstallOptions = {},
): Promise<void> {
  const [pkgName, version] = parsePackageSpec(packageSpec);

  const spinner = ora({
    text: theme.muted(`Checking ${pkgName} before install...`),
    color: 'cyan',
  }).start();

  let result: VetoResult;
  try {
    result = await api.vetoCheck(pkgName, version);
  } catch {
    spinner.fail(theme.error('Crowsnest API unreachable — proceeding without veto check'));
    console.log(theme.muted('Start the API with: uvicorn packages.core.api:app --reload'));
    await runNpmInstall(packageSpec);
    return;
  }

  if (result.blocked) {
    spinner.fail(theme.status.blocked(`Blocked: ${result.package}`));
    renderBlockScreen(result);
    if (options.acknowledgeRisk) {
      const probPct = Math.round(result.probability * 100);
      console.log(
        theme.status.warning(
          `${icons.warn} Proceeding despite blocked risk score ${probPct}% — acknowledged via --crowsnest-acknowledge-risk`,
        ),
      );
      console.log();
      await runNpmInstall(packageSpec);
      return;
    }
    process.exit(3);
  } else {
    spinner.succeed(theme.status.approved(`Approved: ${result.package}${result.version ? '@' + result.version : ''}`));
    renderApprovalScreen(result);
    await runNpmInstall(packageSpec);
  }
}

function renderBlockScreen(result: VetoResult): void {
  const probPct = Math.round(result.probability * 100);

  const lines: string[] = [`${icons.blocked} BLOCKED: ${result.package}`, ''];

  for (const signal of result.signals) {
    const icon = signal.includes('IOC') ? icons.critical :
                  signal.includes('hallucination') ? icons.bot :
                  signal.includes('days ago') ? icons.calendar :
                  signal.includes('downloads') ? icons.trendDown :
                  signal.includes('repository') ? icons.link :
                  signal.includes('Typosquat') ? icons.mask : icons.warn;
    lines.push(`  ${icon}  ${signal}`);
  }

  lines.push('');
  lines.push(`  Slopsquatting probability:  ${probPct}%`);

  if (result.override_flag) {
    lines.push('');
    lines.push(`  To override (risk accepted):`);
    lines.push(`    npm install ${result.package} ${result.override_flag}`);
  }

  console.log();
  console.log(banner(lines, { tone: 'blocked' }));
  console.log();
}

function renderApprovalScreen(result: VetoResult): void {
  const probPct = Math.round(result.probability * 100);

  const lines: string[] = [`${icons.ok} APPROVED: ${result.package}${result.version ? '@' + result.version : ''}`];

  if (result.signals.length > 0) {
    for (const signal of result.signals) {
      lines.push(`  ${icons.info}  ${signal}`);
    }
  }

  lines.push(`  Risk score: ${probPct}%`);

  console.log();
  console.log(banner(lines, { tone: 'approved' }));
  console.log();
  console.log(theme.muted('Proceeding with installation...'));
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

function parsePackageSpec(spec: string): [string, string | undefined] {
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
