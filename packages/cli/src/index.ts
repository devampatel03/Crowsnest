#!/usr/bin/env node
/**
 * Crowsnest CLI — supply chain forensics agent
 * See the storm before it hits your ship.
 */

import { Command } from 'commander';
import { scanCommand } from './commands/scan.js';
import { investigateCommand } from './commands/investigate.js';
import { blastRadiusCommand } from './commands/blast-radius.js';
import { replayCommand } from './commands/replay.js';
import { watchCommand } from './commands/watch.js';
import { installCommand } from './commands/install.js';
import { configGetCommand, configSetCommand } from './commands/config-cmd.js';
import { theme } from './display/theme.js';
import { banner } from './display/banner.js';

const program = new Command();

program
  .name('crowsnest')
  .description('Supply chain forensics — see the storm before it hits your ship')
  .version('0.1.0');

program.addHelpText('beforeAll', () =>
  banner(
    [theme.brand('CROWSNEST'), theme.muted('Supply chain forensics — see the storm before it hits your ship')],
    { tone: 'info' },
  ) + '\n',
);

// ── scan ──────────────────────────────────────────────────────────────────
program
  .command('scan [path]')
  .description('Run a full supply chain scan on a project')
  .option('-e, --ecosystem <eco>', 'package ecosystem (npm|pypi|cargo|go)', 'npm')
  .option('-f, --format <fmt>', 'output format (table|json)', 'table')
  .option('--watch', 'daemon mode: re-run every 5 minutes')
  .action(async (path: string | undefined, opts) => {
    await scanCommand(path || process.cwd(), opts);
  });

// ── investigate ───────────────────────────────────────────────────────────
program
  .command('investigate <package>')
  .description('Deep investigation of a specific package')
  .option('--deep', 'run additional follow-up queries')
  .option('-e, --ecosystem <eco>', 'ecosystem', 'npm')
  .action(async (pkg: string, opts) => {
    await investigateCommand(pkg, opts);
  });

// ── blast-radius ──────────────────────────────────────────────────────────
program
  .command('blast-radius')
  .description('Compute exposure if a maintainer is compromised')
  .option('-m, --maintainer <login>', 'maintainer GitHub/npm login')
  .option('-e, --ecosystem <eco>', 'ecosystem', 'npm')
  .option('--all', 'show risk ranking for all top-50 maintainers')
  .action(async (opts) => {
    await blastRadiusCommand(opts);
  });

// ── replay ────────────────────────────────────────────────────────────────
program
  .command('replay')
  .description('Replay a known incident against Time Machine historical snapshot')
  .option('--ioc <name>', 'IOC campaign name (e.g. shai-hulud-wave-4)')
  .option('--date <YYYY-MM-DD>', 'specific snapshot date')
  .option('-f, --format <fmt>', 'output format (table|json)', 'table')
  .action(async (opts) => {
    await replayCommand(opts);
  });

// ── watch ─────────────────────────────────────────────────────────────────
program
  .command('watch')
  .description(
    'Daemon mode: stream live supply chain events to the console. ' +
      'For Slack alerts, run the @crowsnest/slack-bot package instead.',
  )
  .action(async () => {
    await watchCommand();
  });

// ── install ───────────────────────────────────────────────────────────────
program
  .command('install <package>')
  .description('Safe install wrapper: veto checks before npm install')
  .option(
    '--crowsnest-acknowledge-risk',
    'Proceed with install despite a risk block',
  )
  .action(async (pkg: string, opts: { crowsnestAcknowledgeRisk?: boolean }) => {
    await installCommand(pkg, { acknowledgeRisk: Boolean(opts.crowsnestAcknowledgeRisk) });
  });

// ── config ────────────────────────────────────────────────────────────────
const configCmd = program.command('config').description('Manage Crowsnest configuration');

configCmd
  .command('get [key]')
  .description('Show configuration value(s)')
  .action((key?: string) => {
    configGetCommand(key);
  });

configCmd
  .command('set <key> <value>')
  .description('Set a configuration value')
  .action((key: string, value: string) => {
    configSetCommand(key, value);
  });

program.parseAsync(process.argv).catch((err: Error) => {
  console.error(theme.error(`\nError: ${err.message}`));
  process.exit(2);
});
