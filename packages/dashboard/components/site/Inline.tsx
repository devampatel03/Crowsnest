import type { ReactNode } from 'react';

/**
 * Renders `backtick` spans as inline code. Used for short copy strings that
 * carry a command (landing copy, About). The visible text is the string with
 * the backticks removed.
 */
export function Inline({ text }: { text: string }): ReactNode {
  const parts = text.split('`');
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <code key={i} className="rounded-ctl bg-raised px-1.5 py-0.5 font-mono text-[0.9em] [overflow-wrap:anywhere]">
        {part}
      </code>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}
