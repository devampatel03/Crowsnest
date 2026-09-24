import chalk from 'chalk';

export const theme = {
  severity: {
    CRITICAL: chalk.bgHex('#ff4d5e').bold.white,
    HIGH:     chalk.hex('#ff8a3d').bold,
    MEDIUM:   chalk.hex('#ffb020').bold,
    LOW:      chalk.hex('#35e6d6'),
  },
  status: {
    blocked:  chalk.hex('#ff4d5e').bold,
    approved: chalk.hex('#2fe6a6').bold,
    warning:  chalk.hex('#ffb020'),
    info:     chalk.hex('#35e6d6'),
    dim:      chalk.dim,
  },
  brand:    chalk.hex('#35e6d6').bold,
  beacon:   chalk.hex('#ffb020').bold,
  muted:    chalk.dim,
  success:  chalk.hex('#2fe6a6'),
  error:    chalk.hex('#ff4d5e'),
};

export function severityColor(s: string): string {
  const fn = theme.severity[s as keyof typeof theme.severity];
  return fn ? fn(` ${s} `) : s;
}
