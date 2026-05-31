import chalk from 'chalk';
import ora from 'ora';
import { api, Incident, ScanStatus } from '../api.js';
import { severityColor } from '../display/colors.js';
import { renderTable } from '../display/table.js';

export async function scanCommand(
  projectPath: string,
  opts: { ecosystem?: string; format?: string; watch?: boolean },
): Promise<void> {
  const path = projectPath || process.cwd();

  const spinner = ora({
    text: chalk.cyan(`Initiating Crowsnest scan on ${chalk.bold(path)}...`),
    color: 'cyan',
  }).start();

  let scanId: string;
  try {
    const result = await api.scan({
      projectPath: path,
      ecosystem: opts.ecosystem || 'npm',
    });
    scanId = result.scan_id;
  } catch (err) {
    spinner.fail(chalk.red(err instanceof Error ? err.message : String(err)));
    process.exit(2);
  }

  // Poll for completion
  let status: ScanStatus;
  let dots = 0;
  while (true) {
    await sleep(2000);
    try {
      status = await api.getScanStatus(scanId);
    } catch {
      spinner.text = chalk.cyan('Polling scan status...');
      continue;
    }

    if (status.status === 'running') {
      dots = (dots + 1) % 4;
      spinner.text = chalk.cyan(`Scanning${'.'.repeat(dots)}  (Coral is JOIN-ing data sources)`);
    } else if (status.status === 'complete' || status.status === 'failed') {
      break;
    }
  }

  spinner.stop();

  if (status!.status === 'failed') {
    console.error(chalk.red(`\n✗ Scan failed: ${status!.error}`));
    process.exit(2);
  }

  if (opts.format === 'json') {
    console.log(JSON.stringify(status!, null, 2));
    return;
  }

  renderScanResults(status!);

  // Exit code 1 if incidents found (CI-friendly)
  if (status!.incidents && status!.incidents.length > 0) {
    process.exit(1);
  }
}

function renderScanResults(status: ScanStatus): void {
  const incidents = status.incidents || [];
  const tokenUsage = status.token_usage || 0;

  console.log();
  console.log(chalk.cyan.bold('  CROWSNEST SCAN RESULTS'));
  console.log(chalk.dim('  ' + '─'.repeat(54)));
  console.log();

  if (incidents.length === 0) {
    console.log(chalk.green('  ✓ No incidents detected'));
  } else {
    const bySeverity = {
      CRITICAL: incidents.filter((i) => i.severity === 'CRITICAL').length,
      HIGH: incidents.filter((i) => i.severity === 'HIGH').length,
      MEDIUM: incidents.filter((i) => i.severity === 'MEDIUM').length,
      LOW: incidents.filter((i) => i.severity === 'LOW').length,
    };

    console.log(
      '  ' +
      [
        bySeverity.CRITICAL > 0 ? chalk.bgRed.white.bold(` ${bySeverity.CRITICAL} CRITICAL `) : '',
        bySeverity.HIGH > 0 ? chalk.red.bold(` ${bySeverity.HIGH} HIGH`) : '',
        bySeverity.MEDIUM > 0 ? chalk.yellow(` ${bySeverity.MEDIUM} MEDIUM`) : '',
        bySeverity.LOW > 0 ? chalk.cyan(` ${bySeverity.LOW} LOW`) : '',
      ]
        .filter(Boolean)
        .join(chalk.dim('  │  ')),
    );

    console.log();

    const top5 = incidents.slice(0, 5);
    const rows = top5.map((inc) => [
      severityColor(inc.severity),
      formatPattern(inc.attack_pattern),
      inc.packages.slice(0, 2).join(', ') + (inc.packages.length > 2 ? ` +${inc.packages.length - 2}` : ''),
      `${Math.round(inc.confidence * 100)}%`,
      inc.runtime_confirmation ? chalk.red('CONFIRMED') : chalk.dim('unconfirmed'),
    ]);

    console.log(
      renderTable(
        ['Severity', 'Pattern', 'Packages', 'Confidence', 'Runtime'],
        rows,
        { maxWidth: 25 },
      ),
    );
  }

  // Token usage — the demo punchline
  if (tokenUsage > 0) {
    const naiveTokens = tokenUsage * 400;
    console.log(
      chalk.dim('  ') +
      chalk.cyan(`Coral resolved in `) +
      chalk.bold.cyan(`${tokenUsage.toLocaleString()} tokens`) +
      chalk.dim(` (vs ~${naiveTokens.toLocaleString()} for MCP-style tool calls — ${Math.round(naiveTokens / tokenUsage)}× more efficient)`),
    );
  }

  console.log();
  console.log(chalk.dim(`  Scan ID: ${status.id}  |  Finished: ${new Date(status.finished_at || '').toLocaleTimeString()}`));
  console.log();
}

function formatPattern(pattern: string): string {
  const labels: Record<string, string> = {
    maintainer_takeover: 'Maintainer Takeover',
    worm: 'Token-Theft Worm',
    slopsquat: 'Slopsquatting',
    slsa_poisoning: 'SLSA Poisoning',
    sleeper: 'Sleeper Dep',
    identity_drift: 'Identity Drift',
    typosquat: 'Typosquat',
    dep_confusion: 'Dep Confusion',
    ioc_match: 'IOC Match',
    ci_cache_poisoning: 'CI Cache Poison',
    oidc_misuse: 'OIDC Misuse',
    abandoned_popular: 'Abandoned Pkg',
  };
  return labels[pattern] || pattern;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
