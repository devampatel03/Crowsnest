import { cn } from '@/lib/format';
import { CopyButton } from './CopyButton';

/**
 * Server-rendered selectable <pre><code>: 6px radius, DM Mono, filename tab
 * and a copy button (client island). The scroll container is keyboard
 * reachable (tabindex 0, role region). Diff blocks mark added/removed lines
 * with the leading glyph plus a tinted background for additions.
 */
export function CodeBlock({
  code,
  lang = 'text',
  filename,
  copy = true,
  maxLines,
}: {
  code: string;
  lang?: 'bash' | 'json' | 'diff' | 'ts' | 'text';
  filename?: string;
  copy?: boolean;
  maxLines?: number;
}) {
  const trimmed = code.replace(/\n$/, '');
  const lines = trimmed.split('\n');
  const regionLabel = `Code: ${filename ?? lang}`;
  return (
    <figure className="m-0 overflow-hidden rounded-ctl border border-rule bg-raised">
      {filename || copy ? (
        <figcaption className="flex min-h-10 items-center justify-between gap-s3 border-b border-rule px-s3 py-1">
          <span className="truncate font-mono text-[0.8125rem] text-fg-mute">{filename ?? lang}</span>
          {copy ? <CopyButton text={trimmed} /> : null}
        </figcaption>
      ) : null}
      <div
        tabIndex={0}
        role="region"
        aria-label={regionLabel}
        className="overflow-auto"
        style={maxLines ? { maxHeight: `${maxLines * 1.65 * 14}px` } : undefined}
      >
        <pre className="m-0 min-w-max select-text p-s3 font-mono text-code text-fg" data-lang={lang}>
          <code>
            {lang === 'diff'
              ? lines.map((line, i) => (
                  <span
                    key={i}
                    data-diff={line.startsWith('+') ? 'add' : line.startsWith('-') ? 'del' : 'ctx'}
                    className={cn('block', line.startsWith('+') && 'bg-diff-add', line.startsWith('-') && 'text-fg-mute')}
                  >
                    {line || ' '}
                  </span>
                ))
              : trimmed}
          </code>
        </pre>
      </div>
    </figure>
  );
}
