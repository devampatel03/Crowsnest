'use client';

import { Nib } from '@/components/mascot';
import { Button } from '@/components/system/Button';
import { SpeechBubble } from '@/components/system/SketchFrame';
import { Surface } from '@/components/system/Surface';
import { ROUTE_ERROR } from '@/lib/content/nib';
import { NEW_ISSUE_URL } from '@/lib/seo/constants';

// No error codes, digests or stack text are shown. This is an error, not a
// Hold: Nib is sheepish, not alarmed.
export default function RouteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Surface className="min-h-screen bg-canvas text-fg">
      <main id="main" className="mx-auto grid max-w-shell gap-x-s6 gap-y-s5 px-s4 pb-s6 pt-s7 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div>
          <h1 className="m-0 font-display text-display-l text-fg">{ROUTE_ERROR.title}</h1>
          <p className="mb-s4 mt-s3 max-w-prose text-body-l text-fg-soft">{ROUTE_ERROR.body}</p>
          <div className="flex flex-wrap items-center gap-s4">
            <Button variant="primary" onClick={() => reset()}>
              Try again
            </Button>
            <Button variant="tertiary" href={NEW_ISSUE_URL} rel="noopener">
              Report it on GitHub ↗
            </Button>
          </div>
        </div>
        <div className="flex flex-col items-start md:items-end">
          <SpeechBubble id="error-bubble" tail="bottom-right" className="mb-s3 mr-[10%] inline-block">
            {ROUTE_ERROR.bubble}
          </SpeechBubble>
          <Nib pose="oops" size={180} />
        </div>
      </main>
    </Surface>
  );
}
