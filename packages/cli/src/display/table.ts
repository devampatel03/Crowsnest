import { table, getBorderCharacters } from 'table';
import chalk from 'chalk';

export function renderTable(
  headers: string[],
  rows: string[][],
  options: { maxWidth?: number } = {},
): string {
  const config = {
    border: getBorderCharacters('norc'),
    columns: headers.reduce((acc, _h, i) => {
      acc[i] = { width: options.maxWidth || 30, truncate: 50 };
      return acc;
    }, {} as Record<number, { width: number; truncate: number }>),
  };

  const styledHeaders = headers.map((h) => chalk.cyan.bold(h));
  return table([styledHeaders, ...rows], config);
}

export function renderKeyValue(data: Record<string, string>): string {
  const maxKey = Math.max(...Object.keys(data).map((k) => k.length));
  return Object.entries(data)
    .map(([k, v]) => `  ${chalk.dim(k.padEnd(maxKey))}  ${v}`)
    .join('\n');
}
