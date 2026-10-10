import { Fragment } from 'react';

/** One or two keys; two keys read as a chord with "then" between them (`g` then `h`). */
export function Kbd({ keys }: { keys: string[] }) {
  return (
    <span className="inline-flex items-center gap-s1">
      {keys.map((k, i) => (
        <Fragment key={`${k}-${i}`}>
          {i > 0 ? <span className="label">then</span> : null}
          <kbd className="inline-flex min-w-5 items-center justify-center rounded-ctl border border-field px-1 font-mono text-[0.75rem] text-fg">
            {k}
          </kbd>
        </Fragment>
      ))}
    </span>
  );
}
