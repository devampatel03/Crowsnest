'use client';

import { useState, type ReactNode } from 'react';
import { Gauge } from '@/components/system/Gauge';
import { TRY } from '@/lib/content/landing';
import { cn } from '@/lib/format';
import { SAMPLES, scoreSample } from '@/lib/sandbox';

/**
 * "Check a name": three labelled fictional samples called in the browser with
 * the repo's install-check weights (lib/sandbox.ts keeps the real arithmetic).
 * The panel leads with the call word and one plain sentence; no scores,
 * totals or thresholds are shown (they live on /docs/cli). Selecting a sample
 * makes no network request. The first paint already holds a full call.
 */
export function Sandbox({ nibs, bubbles }: { nibs: Record<string, ReactNode>; bubbles: Record<string, ReactNode> }) {
  const [name, setName] = useState<string>(SAMPLES[2].name);
  const sample = SAMPLES.find((s) => s.name === name) ?? SAMPLES[2];
  const scored = scoreSample(sample);

  const note = TRY.nib[sample.name]?.note ?? '';

  return (
    <div className="relative">
      {/* Nib sits on the panel's top edge and shows the call with the body: nod, squint or ring. */}
      <div className="pointer-events-none absolute right-s3 top-0 z-10 w-[5.25rem] -translate-y-[93%] md:right-s5 md:w-[6.5rem] [&_svg]:h-auto [&_svg]:w-full">
        {nibs[sample.name]}
      </div>
      <p className="label m-0 border-b border-rule px-s4 py-s3">{TRY.panelLabel}</p>
      <div className="grid md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
        <div role="group" aria-label={TRY.legend} className="flex flex-col border-b border-rule p-s3 md:border-b-0 md:border-r">
          <p className="label m-0 mb-s2 px-s2">{TRY.legend}</p>
          {SAMPLES.map((s) => {
            const on = s.name === name;
            return (
              <button
                key={s.name}
                type="button"
                aria-pressed={on}
                onClick={() => setName(s.name)}
                className={cn(
                  'flex min-h-11 w-full items-center border-l-2 px-s3 text-left font-mono text-code transition-colors duration-ui ease-lookout',
                  on ? 'border-brand bg-pressed text-fg' : 'border-transparent text-fg-soft hover:bg-raised',
                )}
              >
                {s.name}
              </button>
            );
          })}
        </div>

        <div className="flex min-w-0 flex-col gap-s4 p-s4 md:p-s5">
          {/* Nib's line sits above the Call, outside the result region, so nothing is announced twice. */}
          <div aria-live="off" className="min-h-[3.25rem]">
            {bubbles[sample.name]}
          </div>
          <div aria-live="polite" className="flex flex-col gap-s3">
            <Gauge key={sample.name} level={scored.level} animate />
            <p className="m-0 min-h-[5.5em] text-body-l text-fg md:min-h-[3.4em]">{sample.happened}</p>
            <p className="m-0 text-body text-fg-soft">
              <span className="font-semibold text-fg">What to do. </span>
              {sample.todo}
            </p>
            {note ? <p className="nib-voice m-0 text-fg">{note}</p> : null}
          </div>

          <div className="min-h-[7rem]">
            <h3 className="m-0 font-sans text-h3 text-fg">{TRY.reasonsLabel}</h3>
            <ul className="m-0 mt-s2 list-none p-0">
              {scored.fired.length === 0 ? (
                <li className="border-b border-rule py-s2 text-body-s text-fg">{TRY.nothingFound}</li>
              ) : (
                scored.fired.map((r) => (
                  <li key={r.id} className="border-b border-rule py-s2 text-body-s text-fg">
                    {r.plain}
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
