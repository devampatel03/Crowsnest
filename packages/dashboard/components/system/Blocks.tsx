import type { ReactNode } from 'react';
import { Button } from './Button';
import { CopyButton } from './CopyButton';

/**
 * Plain-words error: what happened as one sentence, an optional second line
 * for the next step, then `Try again →` and an optional help link. No raw
 * exception text, no environment variable names.
 */
export function ErrorBlock({
  what,
  next,
  onRetry,
  retryLabel = 'Try again',
  help,
}: {
  what: string;
  next?: string;
  onRetry?: () => void;
  retryLabel?: string;
  help?: { href: string; label: string };
}) {
  return (
    <div role="alert" className="flex flex-col items-start gap-s3 p-s4">
      <div className="flex flex-col gap-s1">
        <p className="m-0 text-body text-fg">{what}</p>
        {next ? <p className="m-0 text-body-s text-fg-soft">{next}</p> : null}
      </div>
      {onRetry || help ? (
        <div className="flex flex-wrap items-center gap-x-s4 gap-y-s2">
          {onRetry ? (
            <Button variant="tertiary" onClick={onRetry}>
              {retryLabel}
            </Button>
          ) : null}
          {help ? (
            <Button variant="tertiary" href={help.href}>
              {help.label}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** One sentence about what Crowsnest is doing, plus an optional exact command. No icon. */
export function EmptyBlock({ sentence, command, children }: { sentence: ReactNode; command?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-s3 p-s4">
      <p className="m-0 max-w-prose text-body-s text-fg-soft">{sentence}</p>
      {command ? (
        <div className="flex max-w-full items-center gap-s2 rounded-ctl border border-rule bg-raised px-s3 py-s1">
          <code className="overflow-x-auto whitespace-nowrap font-mono text-[0.8125rem] text-fg">{command}</code>
          <CopyButton text={command} />
        </div>
      ) : null}
      {children}
    </div>
  );
}
