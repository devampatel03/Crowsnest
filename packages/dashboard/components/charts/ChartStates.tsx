import type { ReactNode } from 'react';
import { ErrorBlock } from '@/components/system/Blocks';
import type { ChartError } from './contracts';

/** Plain-words error block; sits where the chart sits so the panel does not jump. */
export function ChartErrorBlock({ error, onRetry }: { error: ChartError; onRetry?: () => void }) {
  return <ErrorBlock what={error.what} next={error.next} help={error.help} onRetry={onRetry} />;
}

/** In-plot caption for empty charts: the flat baseline stays, the sentence says what Crowsnest is doing. */
export function InPlotCaption({ children }: { children: ReactNode }) {
  return <p className="m-0 max-w-prose text-body-s text-fg-soft">{children}</p>;
}
