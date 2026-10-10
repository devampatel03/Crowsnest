import type { Metadata } from 'next';
import { Nib } from '@/components/mascot';
import { SiteFrame } from '@/components/site/SiteFrame';
import { Button } from '@/components/system/Button';
import { SpeechBubble } from '@/components/system/SketchFrame';
import { NOT_FOUND } from '@/lib/content/nib';
import { CONSOLE_ROBOTS } from '@/lib/seo/metadata';

// Rendered at the root, outside the route groups, so it carries its own Deep
// shell. noindex; Next sends the 404 status.
export const metadata: Metadata = {
  title: { absolute: 'Page not found — Crowsnest' },
  description:
    "That page isn't here. Try the Crowsnest docs, blog or glossary, or go straight to the install steps so you can start checking your packages.",
  robots: CONSOLE_ROBOTS,
};

export default function NotFound() {
  return (
    <SiteFrame>
      <div className="mx-auto grid w-full max-w-shell gap-x-s6 gap-y-s5 px-s4 pb-s4 pt-s7 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div>
          <h1 className="m-0 font-display text-display-l text-fg">{NOT_FOUND.title}</h1>
          <p className="mb-s5 mt-s3 max-w-prose text-body-l text-fg-soft">{NOT_FOUND.body}</p>
          <div className="flex flex-wrap items-center gap-x-s5 gap-y-s2">
            <Button variant="tertiary" href="/docs">
              Docs
            </Button>
            <Button variant="tertiary" href="/blog">
              Blog
            </Button>
            <Button variant="tertiary" href="/glossary">
              Glossary
            </Button>
            <Button variant="tertiary" href="/#install">
              Install Crowsnest
            </Button>
          </div>
        </div>
        <div className="flex flex-col items-start md:items-end">
          <SpeechBubble id="not-found-bubble" tail="bottom-right" className="mb-s3 mr-[10%] inline-block">
            {NOT_FOUND.bubble}
          </SpeechBubble>
          <Nib pose="lost" size={200} animate title={NOT_FOUND.poseTitle} />
        </div>
      </div>
    </SiteFrame>
  );
}
