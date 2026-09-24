import { theme } from './theme.js';

const WIDTH = 56;

export function sectionHeader(title: string): string {
  const line = '─'.repeat(WIDTH);
  return `${theme.muted(line)}\n${theme.brand(title.toUpperCase())}\n${theme.muted(line)}`;
}

export function banner(lines: string[], opts: { tone?: 'blocked' | 'approved' | 'info' } = {}): string {
  const border = '═'.repeat(WIDTH);
  const color = opts.tone === 'blocked' ? theme.error : opts.tone === 'approved' ? theme.success : theme.brand;
  const out = [color(border)];
  for (const l of lines) out.push(`${color('[crowsnest]')} ${l}`);
  out.push(color(border));
  return out.join('\n');
}
