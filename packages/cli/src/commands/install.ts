/**
 * crowsnest install <package>[@version]
 *
 * Pre-install veto hook — the demo's stopping moment.
 * Checks the package against Crowsnest before running npm install.
 */

import { spawn } from 'child_process';
import chalk from 'chalk';
import ora from 'ora';
import { api, VetoResult } from '../api.js';

const BORDER = '═'.repeat(56);

export async function installCommand(packageSpec: string): Promise<void> {
  const [pkgName, version] = parsePackageSpec(packageSpec);

  const spinner = ora({
    text: chalk.dim(`Checking ${pkgName} before install...`),
    color: 'cyan',
  }).start();

  let result: VetoResult;
  try {
    result = await api.vetoCheck(pkgName, version);
  } catch (err) {
    spinner.fail(chalk.red('Crowsnest API unreachable — proceeding without veto check'));
    console.log(chalk.dim('Start the API with: uvicorn packages.core.api:app --reload'));
    await runNpmInstall(packageSpec);
    return;
  }

  spinner.stop();

  if (result.blocked) {
    renderBlockScreen(result);
    process.exit(3);
  } else {
    renderApprovalScreen(result);
    await runNpmInstall(packageSpec);
  }
}

function renderBlockScreen(result: VetoResult): void {
  const probPct = Math.round(result.probability * 100);

  console.log();
  console.log(chalk.red(`[crowsnest] ${BORDER}`));
  console.log(chalk.red.bold(`[crowsnest] ⛔ BLOCKED: ${result.package}`));
  console.log(chalk.red(`[crowsnest] ${BORDER}`));
  console.log();

  for (const signal of result.signals) {
    const emoji = signal.includes('IOC') ? '🚨' :
                  signal.includes('hallucination') ? '🤖' :
                  signal.includes('days ago') ? '📅' :
                  signal.includes('downloads') ? '📉' :
                  signal.includes('repository') ? '🔗' :
                  signal.includes('Typosquat') ? '🎭' : '⚠️ ';
    console.log(chalk.yellow(`[crowsnest]   ${emoji}  ${signal}`));
  }

  console.log();
  console.log(chalk.red(`[crowsnest]   Slopsquatting probability:  ${chalk.bold(probPct + '%')}`));
  console.log();

  if (result.override_flag) {
    console.log(chalk.dim(`[crowsnest]   To override (risk accepted):`));
    console.log(chalk.dim(`[crowsnest]     npm install ${result.package} ${result.override_flag}`));
  }

  console.log(chalk.red(`[crowsnest] ${BORDER}`));
  console.log();
}

function renderApprovalScreen(result: VetoResult): void {
  const probPct = Math.round(result.probability * 100);
  const riskColor = probPct < 20 ? chalk.green : probPct < 40 ? chalk.yellow : chalk.red;

  console.log();
  console.log(chalk.green(`[crowsnest] ✓ APPROVED: ${result.package}${result.version ? '@' + result.version : ''}`));

  if (result.signals.length > 0) {
    for (const signal of result.signals) {
      console.log(chalk.dim(`[crowsnest]   ℹ  ${signal}`));
    }
  }

  console.log(chalk.dim(`[crowsnest]   Risk score: `) + riskColor(`${probPct}%`));
  console.log();
  console.log(chalk.dim('Proceeding with installation...'));
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
