import chalk from 'chalk';

export const severity = {
  CRITICAL: chalk.bgRed.bold.white,
  HIGH: chalk.red.bold,
  MEDIUM: chalk.yellow.bold,
  LOW: chalk.cyan,
};

export const status = {
  blocked: chalk.red.bold,
  approved: chalk.green.bold,
  warning: chalk.yellow,
  info: chalk.cyan,
  dim: chalk.dim,
};

export const brand = chalk.cyan.bold;
export const muted = chalk.dim;
export const success = chalk.green;
export const error = chalk.red;

export function severityColor(s: string): string {
  const fn = severity[s as keyof typeof severity];
  return fn ? fn(` ${s} `) : s;
}
