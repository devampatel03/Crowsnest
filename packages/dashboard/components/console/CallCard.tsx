'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Button, Call, Gauge, Knot } from '@/components/system';
import { callFor, type Call as CallModel } from '@/lib/calls';
import { alsoFound } from '@/lib/console/groups';
import { AffectedList } from './AffectedList';
import { cn } from '@/lib/format';
import { isoTitle, timeAgo } from '@/lib/time';
import type { Incident } from '@/lib/types';

/** `Who else is affected`: projects (folder names), each with the packages of yours that depend on this. */
function WhoElse({ call }: { call: CallModel }) {
  return (
    <section className="flex min-w-0 flex-col gap-s2 border-t border-rule pt-s3">
      <h4 className="label m-0">Who else is affected</h4>
      {call.who.length === 0 ? (
        <p className="m-0 text-body-s text-fg-soft">Crowsnest couldn&apos;t find which projects use this.</p>
      ) : (
        <AffectedList projects={call.who} />
      )}
    </section>
  );
}

function Details({ call, id }: { call: CallModel; id: string }) {
  return (
    <div id={id} className="flex min-w-0 flex-col gap-s3">
      <p className="m-0 text-body-s text-fg-mute">How sure: {call.howSure}</p>
      <WhoElse call={call} />
      {call.moreDetail.length > 0 ? (
        <section className="flex min-w-0 flex-col gap-s2 border-t border-rule pt-s3">
          <h4 className="label m-0">More detail</h4>
          <ul className="m-0 flex list-disc flex-col gap-1 pl-s4 text-body-s text-fg-mute">
            {call.moreDetail.map((t, i) => (
              <li key={i} className="break-words">
                {t}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** `package@version · Used in 3 projects · Found 2 days ago`. The absolute time is in the title. */
function DetailLine({ call, now }: { call: CallModel; now: number }) {
  return (
    <>
      <span className="break-words">{call.subject}</span>
      {call.projectCount !== null ? <> · {call.usedIn}</> : null}
      {call.detectedAt ? (
        <>
          {' · '}Found{' '}
          <time dateTime={call.detectedAt} title={isoTitle(call.detectedAt)}>
            {timeAgo(call.detectedAt, now)}
          </time>
        </>
      ) : null}
    </>
  );
}

/**
 * The Call card (S3): one incident in the fixed shape. Collapsed it shows the
 * headline, the quiet line and the main action; `What to do` opens the other
 * advice and the plain who-else list in place. Nothing here prints a pattern
 * code, template name or confidence number. No Nib art, no hand face, no joke
 * ever appears inside a Call.
 *
 * `alsoCount` is the number of other calls with the identical pattern, packages
 * and people (see `lib/console/groups.ts`); it prints one plain line and a link.
 */
export function CallCard({
  incident,
  now,
  defaultOpen = false,
  headingLevel = 3,
  alsoCount = 0,
}: {
  incident: Incident;
  now: number;
  defaultOpen?: boolean;
  headingLevel?: 2 | 3 | 4;
  alsoCount?: number;
}) {
  const call = callFor(incident);
  const [open, setOpen] = useState(defaultOpen);
  const detailsId = useId();
  return (
    <div id={`call-${incident.id}`} className="min-w-0 scroll-mt-20">
      <Call
        level={call.level}
        urgent={call.urgent}
        headline={call.headline}
        headingLevel={headingLevel}
        detail={<DetailLine call={call} now={now} />}
        advice={call.advice}
      >
        <div className="flex flex-col gap-s3">
          {alsoCount > 0 ? (
            <p className="m-0 flex flex-wrap items-center gap-x-s3 text-body-s text-fg-mute" data-also-found title="Same call on the same packages. Log lists each one.">
              <span>{alsoFound(alsoCount)}</span>
              <Button variant="tertiary" href="/log">
                See each in Log
              </Button>
            </p>
          ) : null}
          <div>
            <Button variant="tertiary" arrow={false} aria-expanded={open} aria-controls={open ? detailsId : undefined} data-nav-item onClick={() => setOpen((o) => !o)}>
              {open ? 'Hide steps' : 'Show steps'}
            </Button>
          </div>
          {open ? <Details call={call} id={detailsId} /> : null}
        </div>
      </Call>
    </div>
  );
}

/**
 * Log form: one line (gauge, headline, package, time) that opens in place to the
 * full call and closes again with `Hide`. Focus follows the control.
 */
export function CallRow({ incident, now, defaultOpen = false, knot = false }: { incident: Incident; now: number; defaultOpen?: boolean; knot?: boolean }) {
  const call = callFor(incident);
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const li = useRef<HTMLLIElement>(null);
  const toggled = useRef(false);
  const ago = call.detectedAt ? timeAgo(call.detectedAt, now) : '';

  // The pressed control is replaced by its opposite: put focus back on it.
  useEffect(() => {
    if (!toggled.current) return;
    li.current?.querySelector<HTMLElement>('[data-nav-item]')?.focus();
  }, [open]);

  const toggle = () => {
    toggled.current = true;
    setOpen((o) => !o);
  };

  return (
    <li ref={li} id={`call-${incident.id}`} className={cn('min-w-0 scroll-mt-20 border-b border-rule last:border-b-0', knot && 'relative')}>
      {knot ? <Knot active={open} className="absolute -left-[1.6875rem] top-[1.375rem] size-[0.625rem] border-2 border-surface" /> : null}
      {open ? (
        <div className="bg-raised px-s3 py-s3">
          <Call
            variant="inline"
            level={call.level}
            urgent={call.urgent}
            headline={call.headline}
            headingLevel={3}
            detail={<DetailLine call={call} now={now} />}
            advice={call.advice}
          >
            <div className="flex flex-col gap-s3">
              <Details call={call} id={bodyId} />
              <div>
                <Button variant="tertiary" arrow={false} aria-expanded data-nav-item onClick={toggle}>
                  Hide
                </Button>
              </div>
            </div>
          </Call>
        </div>
      ) : (
        <button
          type="button"
          aria-expanded={false}
          data-nav-item
          onClick={toggle}
          className={cn(
            'grid w-full min-w-0 items-center gap-x-s4 gap-y-1 px-s3 py-s2 text-left transition-colors duration-ui ease-lookout hover:bg-raised',
            'min-h-11 md:grid-cols-[148px_minmax(0,1fr)_minmax(0,13.75rem)_7rem]',
          )}
        >
          <Gauge level={call.level} urgent={call.urgent} />
          <span className="min-w-0 text-body-s text-fg">{call.headline}</span>
          <span className="min-w-0 break-words text-body-s text-fg-mute md:truncate">{call.subject}</span>
          <span className="text-body-s text-fg-mute md:text-right" title={call.detectedAt ? isoTitle(call.detectedAt) : undefined}>
            {ago}
          </span>
          <span className="sr-only">What to do</span>
        </button>
      )}
    </li>
  );
}
