import chalk from 'chalk';
import ora from 'ora';
import { api } from '../api.js';
import { renderBlastRadiusTree } from '../display/tree.js';

export async function blastRadiusCommand(
  opts: { maintainer?: string; ecosystem?: string; all?: boolean },
): Promise<void> {
  if (!opts.maintainer && !opts.all) {
    console.error(chalk.red('Error: --maintainer <login> is required (or use --all for top-50)'));
    process.exit(2);
  }

  const ecosystem = opts.ecosystem || 'npm';

  if (opts.all) {
    await showAllMaintainersRisk();
    return;
  }

  const maintainer = opts.maintainer!;
  const spinner = ora({
    text: chalk.cyan(`Computing blast radius for ${maintainer}...`),
  }).start();

  let result;
  try {
    result = await api.blastRadius(maintainer, ecosystem);
  } catch (err) {
    spinner.fail(chalk.red(err instanceof Error ? err.message : String(err)));
    process.exit(2);
  }

  spinner.stop();

  console.log();
  console.log(renderBlastRadiusTree(maintainer, result.packages_controlled, result.affected_projects));

  console.log(chalk.dim('  Summary:'));
  console.log(`  ${chalk.cyan('Total affected deps:')}   ${result.total_affected_deps}`);
  console.log(`  ${chalk.cyan('Runtime confirmed:')}     ${result.runtime_confirmed_count} / ${result.total_affected_deps}`);

  if (result.total_affected_deps > 0) {
    const pct = Math.round((result.total_affected_deps / 100) * 100); // approximate
    console.log(`  ${chalk.cyan('Graph risk score:')}      ~${pct}% of transitive graph`);
  }

  console.log();
}

async function showAllMaintainersRisk(): Promise<void> {
  const spinner = ora({ text: chalk.cyan('Loading maintainer reputation scores...') }).start();

  let scores;
  try {
    scores = await api.getMaintainerReputation();
  } catch (err) {
    spinner.fail(chalk.red(err instanceof Error ? err.message : String(err)));
    process.exit(2);
  }

  spinner.stop();

  console.log();
  console.log(chalk.cyan.bold('  Counterfactual Blast Radius — Top Risk Maintainers'));
  console.log(chalk.dim('  If any of these accounts are compromised, here is your exposure:'));
  console.log();

  const top20 = scores.slice(0, 20);
  for (const s of top20) {
    const riskBar = renderRiskBar(s.risk_score);
    const iocFlag = s.ioc_flagged ? chalk.red(' [IOC FLAGGED]') : '';
    console.log(
      `  ${riskBar} ${chalk.bold(s.login.padEnd(25))} ${chalk.dim(`${s.packages_in_graph} pkgs`)}${iocFlag}`,
    );
  }

  console.log();
  console.log(chalk.dim('  The bottom of this list is where the next attack will land.'));
  console.log();
}

function renderRiskBar(score: number): string {
  const filled = Math.round(score * 10);
  const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
  const color = score >= 0.7 ? chalk.red : score >= 0.4 ? chalk.yellow : chalk.green;
  return color(`[${bar}]`);
}
