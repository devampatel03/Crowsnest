#!/usr/bin/env node
/**
 * Crowsnest command-line interface.
 */

import { createRequire } from 'node:module';
import { Command } from 'commander';
import { scanCommand } from './commands/scan.js';
import { investigateCommand } from './commands/investigate.js';
import { blastRadiusCommand } from './commands/blast-radius.js';
import { replayCommand } from './commands/replay.js';
import { watchCommand } from './commands/watch.js';
import { installCommand } from './commands/install.js';
import { checkCommand } from './commands/check.js';
import { configGetCommand, configSetCommand } from './commands/config-cmd.js';
import { doctorCommand, startCommand, stopCommand, StartError } from './commands/backend.js';
import { theme } from './display/theme.js';
import { banner } from './display/banner.js';

// One source of truth for the version: package.json sits one level above both src/ and dist/.
const pkg = createRequire(import.meta.url)('../package.json') as { version: string };

const program = new Command();

program
  .name('crowsnest')
  .description('Supply chain forensics — see the storm before it hits your ship')
  .version(pkg.version);

program.addHelpText('beforeAll', () =>
  banner(
    [theme.brand('CROWSNEST'), theme.muted('Supply chain forensics — see the storm before it hits your ship')],
    { tone: 'info' },
  ) + '\n',
);

program
  .command('start')
  .description('Start the Crowsnest backend in Docker on this machine (the other commands need it)')
  .option('-p, --port <port>', 'port on this machine', '8000')
  .option('--projects <folder>', 'folder of your projects to share, read only (default: the current folder)')
  .option('--env-file <file>', 'file of optional keys to pass in, such as ANTHROPIC_API_KEY=...')
  .action(async (opts: { port?: string; projects?: string; envFile?: string }) => {
    await startCommand(opts);
  });

program
  .command('stop')
  .description('Stop the Crowsnest backend that `crowsnest start` began')
  .option('--delete-data', 'also delete everything Crowsnest has stored')
  .action(async (opts: { deleteData?: boolean }) => {
    await stopCommand({ deleteData: Boolean(opts.deleteData) });
  });

program
  .command('doctor')
  .description('Check Docker, the backend and the internet lookups, and say how to fix what is wrong')
  .action(async () => {
    // Not process.exit(): on Windows it can abort while a timed-out request is still closing.
    process.exitCode = await doctorCommand();
  });

program
  .command('scan [path]')
  .description('Run a full supply chain scan on a project')
  .option('-e, --ecosystem <eco>', 'package ecosystem (npm|pypi|cargo|go)', 'npm')
  .option('-f, --format <fmt>', 'output format (table|json)', 'table')
  .option('--watch', 'daemon mode: re-run every 5 minutes')
  .action(async (path: string | undefined, opts) => {
    await scanCommand(path || process.cwd(), opts);
  });

program
  .command('investigate <package>')
  .description('Deep investigation of a specific package')
  .option('--deep', 'run additional follow-up queries')
  .option('-e, --ecosystem <eco>', 'ecosystem', 'npm')
  .action(async (pkg: string, opts) => {
    await investigateCommand(pkg, opts);
  });

program
  .command('blast-radius')
  .description('Compute exposure if a maintainer is compromised')
  .option('-m, --maintainer <login>', 'maintainer GitHub/npm login')
  .option('-e, --ecosystem <eco>', 'ecosystem', 'npm')
  .option('--all', 'show risk ranking for all top-50 maintainers')
  .action(async (opts) => {
    await blastRadiusCommand(opts);
  });

program
  .command('replay')
  .description('Replay a known incident against Time Machine historical snapshot')
  .option('--ioc <name>', 'IOC campaign name (e.g. shai-hulud-wave-4)')
  .option('--date <YYYY-MM-DD>', 'specific snapshot date')
  .option('-f, --format <fmt>', 'output format (table|json)', 'table')
  .action(async (opts) => {
    await replayCommand(opts);
  });

program
  .command('watch')
  .description(
    'Daemon mode: stream live supply chain events to the console. ' +
      'For Slack alerts, run the @crowsnest/slack-bot package instead.',
  )
  .action(async () => {
    await watchCommand();
  });

program
  .command('install <package>')
  .description('Safe install wrapper: veto checks before npm install')
  .option(
    '--crowsnest-acknowledge-risk',
    'Proceed with install despite a risk block',
  )
  .option('--min-release-age <days>', 'days a version must have been public (0 turns the rule off)')
  .option('--strict', 'refuse to install if the Crowsnest API cannot be reached')
  .action(
    async (
      pkg: string,
      opts: { crowsnestAcknowledgeRisk?: boolean; minReleaseAge?: string; strict?: boolean },
    ) => {
      await installCommand(pkg, {
        acknowledgeRisk: Boolean(opts.crowsnestAcknowledgeRisk),
        minReleaseAge: opts.minReleaseAge,
        strict: Boolean(opts.strict),
      });
    },
  );

program
  .command('check [path]')
  .description('Vet the package versions a change adds (for pull requests); exits 3 when one is blocked')
  .option('-b, --base <ref>', 'git ref to compare with, such as origin/main (omit to check every version)')
  .option('--min-release-age <days>', 'days a version must have been public (0 turns the rule off)')
  .option('-f, --format <fmt>', 'output format (table|json)', 'table')
  .action(async (path: string | undefined, opts: { base?: string; minReleaseAge?: string; format?: string }) => {
    await checkCommand(path || process.cwd(), opts);
  });

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
  // A StartError is a problem with a plain fix, so it is shown as advice, not as a failure with a stack.
  console.error(theme.error(err instanceof StartError ? `\n${err.message}` : `\nError: ${err.message}`));
  process.exit(2);
});
