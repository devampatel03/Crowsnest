import ora from 'ora';
import { api } from '../api.js';
import { theme } from '../display/theme.js';
import { renderBlastRadiusTree } from '../display/tree.js';
import { renderKeyValue } from '../display/table.js';

export async function blastRadiusCommand(
  opts: { maintainer?: string; ecosystem?: string; all?: boolean },
): Promise<void> {
  if (!opts.maintainer && !opts.all) {
    console.error(theme.error('Error: --maintainer <login> is required (or use --all for top-50)'));
    process.exit(2);
  }

  const ecosystem = opts.ecosystem || 'npm';

  if (opts.all) {
    await showAllMaintainersRisk();
    return;
  }

  const maintainer = opts.maintainer!;
  const spinner = ora({
    text: theme.brand(`Computing blast radius for ${maintainer}...`),
  }).start();

  let result;
  try {
    result = await api.blastRadius(maintainer, ecosystem);
  } catch (err) {
    spinner.fail(theme.error(err instanceof Error ? err.message : String(err)));
    process.exit(2);
  }

  spinner.succeed(theme.success(`Blast radius computed for ${maintainer}`));

  console.log();
  console.log(theme.brand('  Maintainer summary'));
  console.log(
    renderKeyValue({
      'Total affected deps': String(result.total_affected_deps),
      'Runtime confirmed': `${result.runtime_confirmed_count} / ${result.total_affected_deps}`,
      ...(result.total_affected_deps > 0
        ? { 'Graph risk score': `~${Math.round((result.total_affected_deps / 100) * 100)}% of transitive graph` }
        : {}),
    }),
  );
  console.log();

  console.log(renderBlastRadiusTree(maintainer, result.packages_controlled, result.affected_projects));
  console.log();
}

async function showAllMaintainersRisk(): Promise<void> {
  const spinner = ora({ text: theme.brand('Loading maintainer reputation scores...') }).start();

  let scores;
  try {
    scores = await api.getMaintainerReputation();
  } catch (err) {
    spinner.fail(theme.error(err instanceof Error ? err.message : String(err)));
    process.exit(2);
  }

  spinner.succeed(theme.success('Maintainer reputation scores loaded'));

  console.log();
  console.log(theme.brand('  Counterfactual Blast Radius — Top Risk Maintainers'));
  console.log(theme.muted('  If any of these accounts are compromised, here is your exposure:'));
  console.log();

  const top20 = scores.slice(0, 20);
  for (const s of top20) {
    const riskBar = renderRiskBar(s.risk_score);
    const iocFlag = s.ioc_flagged ? theme.error(` [IOC FLAGGED]`) : '';
    console.log(
      `  ${riskBar} ${theme.brand(s.login.padEnd(25))} ${theme.muted(`${s.packages_in_graph} pkgs`)}${iocFlag}`,
    );
  }

  console.log();
  console.log(theme.muted('  The bottom of this list is where the next attack will land.'));
  console.log();
}

function renderRiskBar(score: number): string {
  const filled = Math.round(score * 10);
  const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
  const color = score >= 0.7 ? theme.error : score >= 0.4 ? theme.status.warning : theme.success;
  return color(`[${bar}]`);
}
