'use client';

import { useCallback, useState } from 'react';
import { Button, Disclosure, Gauge } from '@/components/system';
import { describeError, vetoCheck } from '@/lib/api';
import { whyHere, type HoldRow } from '@/lib/console/hold';
import { plainVeto, type PlainVeto } from '@/lib/console/veto';
import { CallCard } from './CallCard';

const VETO_LEVEL = { hold: 'hold', warn: 'watch', ok: 'clear', unknown: 'note' } as const;

export type VetoState = { status: 'idle' } | { status: 'loading'; pkg: string } | { status: 'done'; pkg: string; result: PlainVeto } | { status: 'error'; pkg: string; message: string };

/** Runs the read-only install check. Never throws; failure becomes a plain sentence. */
export function useVeto(): { state: VetoState; run: (pkg: string, version?: string, ecosystem?: string) => Promise<void>; clear: () => void } {
  const [state, setState] = useState<VetoState>({ status: 'idle' });
  const run = useCallback(async (pkg: string, version?: string, ecosystem?: string) => {
    setState({ status: 'loading', pkg });
    try {
      setState({ status: 'done', pkg, result: plainVeto(await vetoCheck(pkg, version, ecosystem)) });
    } catch (e) {
      setState({ status: 'error', pkg, message: describeError(e) });
    }
  }, []);
  return { state, run, clear: () => setState({ status: 'idle' }) };
}

/** The plain result of a check: a headline, then one reason per line. No codes, no raw backend text. */
export function VetoResultView({ state }: { state: VetoState }) {
  return (
    <div role="status" aria-live="polite" className="min-h-6">
      {state.status === 'loading' ? <p className="m-0 text-body-s text-fg-soft">Checking {state.pkg}…</p> : null}
      {state.status === 'error' ? <p className="m-0 text-body-s text-fg">{state.message}</p> : null}
      {state.status === 'done' ? (
        <div className="flex min-w-0 flex-col gap-s2">
          <p className="m-0 flex flex-wrap items-center gap-x-s2 text-body-s text-fg">
            <span className="font-semibold">{state.pkg}</span>
            {state.result.level === 'unknown' ? null : <Gauge level={VETO_LEVEL[state.result.level]} showWord={false} />}
            <span>{state.result.headline}</span>
          </p>
          {state.result.note ? <p className="m-0 text-body-s text-fg-soft">{state.result.note}</p> : null}
          {state.result.reasons.length > 0 ? (
            <ul className="m-0 flex list-disc flex-col gap-1 pl-s4 text-body-s text-fg-soft">
              {state.result.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Side panel for one package: why it is here, the call if there is one, a check, and the technical lines. */
export function HoldDetail({ row, now }: { row: HoldRow; now: number }) {
  const { entry, incident } = row;
  const veto = useVeto();
  return (
    <div className="flex min-w-0 flex-col gap-s4">
      <div className="flex min-w-0 flex-col gap-1">
        <h3 className="m-0 break-all font-sans text-h3 text-fg">
          {entry.package} <span className="font-normal text-fg-mute">{entry.version}</span>
        </h3>
      </div>
      <section className="flex flex-col gap-1">
        <h4 className="label m-0">Why is this here?</h4>
        <p className="m-0 break-words text-body-s text-fg-soft">{whyHere(entry)}</p>
      </section>
      {incident ? (
        <>
          <section className="flex flex-col gap-1">
            <h4 className="label m-0">Why is it flagged?</h4>
            <p className="m-0 text-body-s text-fg-soft">
              Crowsnest made a call about this package, and the call is rated {row.level === 'hold' ? 'Hold' : row.level === 'watch' ? 'Watch' : 'Note'}
              {row.urgent ? ' and urgent' : ''}.
              {incident.attack_pattern === 'maintainer_takeover' ? ' It covers every package this maintainer publishes in your projects, not only this one.' : ''}
            </p>
          </section>
          <CallCard incident={incident} now={now} headingLevel={4} />
        </>
      ) : null}
      <div className="flex flex-col items-start gap-s2">
        <Button variant="tertiary" onClick={() => void veto.run(entry.package, entry.version, entry.ecosystem)}>
          Check this package
        </Button>
        <VetoResultView state={veto.state} />
      </div>
      <Disclosure
        items={[
          {
            id: `tech-${row.key}`,
            question: 'Technical details',
            answer: (
              <div className="flex min-w-0 flex-col gap-s2 font-mono text-[0.75rem] text-fg-soft">
                <p className="m-0 break-all">{entry.integrity_hash || 'No integrity code recorded.'}</p>
                <p className="m-0 break-all">{entry.resolved_url || 'No download address recorded.'}</p>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
