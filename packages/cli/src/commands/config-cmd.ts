import chalk from 'chalk';
import { getAllConfig, setConfig, CrowsnestConfig } from '../config.js';

export function configGetCommand(key?: string): void {
  const config = getAllConfig();
  if (key) {
    const val = config[key as keyof CrowsnestConfig];
    if (val === undefined) {
      console.error(chalk.red(`Unknown config key: ${key}`));
      process.exit(2);
    }
    console.log(val);
  } else {
    console.log();
    console.log(chalk.cyan.bold('  Crowsnest Configuration'));
    console.log();
    for (const [k, v] of Object.entries(config)) {
      const display = k.includes('key') || k.includes('token') || k.includes('Key')
        ? v ? chalk.dim('***set***') : chalk.red('(not set)')
        : v || chalk.dim('(not set)');
      console.log(`  ${chalk.dim(k.padEnd(20))}  ${display}`);
    }
    console.log();
  }
}

export function configSetCommand(key: string, value: string): void {
  const validKeys: (keyof CrowsnestConfig)[] = [
    'apiUrl', 'githubToken', 'npmToken', 'socketApiKey', 'anthropicApiKey',
  ];
  if (!validKeys.includes(key as keyof CrowsnestConfig)) {
    console.error(chalk.red(`Unknown config key: ${key}`));
    console.error(chalk.dim(`Valid keys: ${validKeys.join(', ')}`));
    process.exit(2);
  }
  setConfig(key as keyof CrowsnestConfig, value);
  console.log(chalk.green(`✓ Set ${key}`));
}
