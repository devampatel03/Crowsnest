import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { Nib } from '@/components/mascot';
import { Inline } from '@/components/site/Inline';
import { Button } from '@/components/system/Button';
import { CopyButton } from '@/components/system/CopyButton';
import { Disclosure } from '@/components/system/Disclosure';
import { Gauge } from '@/components/system/Gauge';
import { SpeechBubble } from '@/components/system/SketchFrame';
import { SketchSky } from '@/components/system/SketchSky';
import { Squiggle } from '@/components/system/Squiggle';
import { FAQ, FAQ_CLOSING, FAQ_SIGNOFF, FAQ_TITLE, HERO, HORIZON_TICKS, HOW, INSTALL, TRY } from '@/lib/content/landing';
import { HeroStage } from './HeroStage';
import { Sandbox } from './Sandbox';
import { LandingStrip } from './Strip';
import { WideFrame } from './WideFrame';

/** Heading text with the pencil underline under its last word (landing H1/H2 rule). */
function Underlined({ id, text }: { id: string; text: string }) {
  const i = text.lastIndexOf(' ');
  if (i < 0) return <Squiggle id={id}>{text}</Squiggle>;
  return (
    <>
      {text.slice(0, i + 1)}
      <Squiggle id={id}>{text.slice(i + 1)}</Squiggle>
    </>
  );
}

const LEVEL_WORD = { clear: 'Clear', watch: 'Watch', hold: 'Hold', note: 'Note' } as const;
const TICK_HEIGHTS = [14, 20, 12, 18, 16, 22, 13, 19, 15, 21, 12, 17];
const STEM_BG = { clear: 'bg-clear', note: 'bg-fg-mute', watch: 'bg-watch', hold: 'bg-hold' } as const;

/** Shared section wrapper: id + data-bearing so the Bearing Rule and server HTML carry the label. */
function Section({ id, title, children, labelledBy }: { id: string; title: string; children: ReactNode; labelledBy: string }) {
  return (
    <section id={id} data-bearing data-bearing-title={title} aria-labelledby={labelledBy} className="scroll-mt-20 py-s5 md:py-s6">
      {children}
    </section>
  );
}

export function HeroSection() {
  return (
    <Section id="top" title={HERO.h1.replace(/\.$/, '')} labelledBy="hero-title">
      <div data-hero className="relative">
        <SketchSky />
        <HeroStage rest={HERO.restBubble} bellLines={HERO.bellLines}>
          <div className="relative grid gap-y-s4 pt-s4 md:grid-cols-[minmax(0,1fr)_minmax(0,19rem)] md:items-end md:gap-x-s5">
            <div>
              <h1 id="hero-title" className="m-0 max-w-[14ch] font-display text-display-xl text-fg md:max-w-[15ch]">
                <Underlined id="hero" text={HERO.h1} />
              </h1>
              <p className="mb-0 mt-s4 max-w-[36rem] text-body-l text-fg-soft">{HERO.subhead}</p>
              <div className="mt-s5 flex flex-col items-start gap-s3">
                <Button id="hero-cta" variant="primary" href="#install">
                  {HERO.cta}
                </Button>
                <p className="m-0 text-body-s text-fg-mute">{HERO.trust}</p>
              </div>
            </div>

            {/* Nib's stage: bubble above, Nib standing on the band below. Nib is a button (the bell), after the Primary in tab order. */}
            <div className="flex flex-col items-end">
              <div data-bubble-wrap data-empty="false" className="mb-s3 mr-[8%] min-h-[4.25rem] w-[min(100%,17.5rem)]">
                <SpeechBubble id="hero-bubble" tail="bottom-right" className="w-full">
                  <span data-bubble-text aria-live="polite">
                    {HERO.restBubble}
                  </span>
                </SpeechBubble>
              </div>
              <button
                type="button"
                data-nib-btn
                aria-label={HERO.nibButton}
                title={HERO.nibTip}
                className="hero-nib w-[9.375rem] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand md:w-[15.625rem]"
              >
                <span className="hero-nib-idle block">
                  <Nib pose="perch" size={250} animate />
                </span>
                <span className="hero-nib-ring block">
                  <Nib pose="ring" size={250} />
                </span>
              </button>
            </div>
          </div>

          <div role="group" aria-label={HERO.bandLabel} className="mt-s1">
            <WideFrame id="hero-band" w={1060} h={200} contentClassName="relative overflow-hidden px-s4 pb-s4 pt-s5 md:px-s5">
              <ul
                aria-label="Packages in the sample project"
                className="relative m-0 flex h-[4rem] list-none items-end justify-between border-b border-rule-strong p-0"
              >
                {HORIZON_TICKS.map((t, i) => {
                  const s = t.sighting;
                  if (!s) {
                    return (
                      <li key={t.id} aria-hidden="true" className="flex items-end">
                        <span className="block w-0.5 bg-fg-mute" style={{ height: TICK_HEIGHTS[i % TICK_HEIGHTS.length] }} />
                      </li>
                    );
                  }
                  return (
                    <li key={t.id} className="flex items-end">
                      <button
                        type="button"
                        data-mark={t.id}
                        data-level={s.level}
                        data-call={s.call}
                        data-bubble={HERO.markBubbles[t.id] ?? ''}
                        aria-pressed="false"
                        aria-describedby="hero-call"
                        aria-label={`${s.name}, ${LEVEL_WORD[s.level]}`}
                        style={{ '--p': (i + 0.5) / HORIZON_TICKS.length } as CSSProperties}
                        className="horizon-mark-sighted flex min-h-11 min-w-11 flex-col items-center justify-end gap-s1 px-1"
                      >
                        <span aria-hidden="true" className="mb-1 flex origin-bottom scale-[1.5]">
                          <Gauge level={s.level} showWord={false} />
                        </span>
                        <span aria-hidden="true" className={`block h-5 w-0.5 ${STEM_BG[s.level]}`} />
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p id="hero-call" aria-live="polite" className="m-0 mt-s4 flex min-h-[3.25rem] items-start gap-s2 text-body text-fg md:min-h-[1.75rem]">
                {(['clear', 'watch', 'hold'] as const).map((l) => (
                  <span key={l} hidden data-call-gauge={l} aria-hidden="true" className="mt-[0.3125rem] flex [&[hidden]]:hidden">
                    <Gauge level={l} showWord={false} />
                  </span>
                ))}
                <span data-call-text />
              </p>
              <span aria-hidden="true" className="horizon-sweep" />
            </WideFrame>
            <p className="m-0 mt-s2 text-body-s text-fg-mute">{HERO.caption}</p>
            <p className="m-0 text-body-s text-fg-mute">{HERO.fine}</p>
          </div>
        </HeroStage>
      </div>
    </Section>
  );
}

export function HowSection() {
  return (
    <Section id="how" title={HOW.title.replace(/\.$/, '')} labelledBy="how-title">
      <h2 id="how-title" className="m-0 font-display text-display-l text-fg">
        <Underlined id="how" text={HOW.title} />
      </h2>
      <div className="mt-s6">
        <LandingStrip />
      </div>
      <p className="mb-0 mt-s3 text-body-s text-fg-mute">{HOW.note}</p>

      <div className="mt-s6 grid gap-s4 border-t border-rule pt-s5 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:gap-x-s6">
        <p className="label m-0">Where it runs</p>
        <ul className="m-0 flex list-none flex-wrap gap-x-s4 gap-y-s2 p-0 text-body">
          {HOW.runs.map((r) => (
            <li key={r.href}>
              <Link href={r.href} className="text-brand underline underline-offset-4 hover:decoration-2">
                {r.lead.charAt(0).toUpperCase() + r.lead.slice(1)}
              </Link>
            </li>
          ))}
        </ul>
        <p className="label m-0">What the calls mean</p>
        <p className="m-0 max-w-prose text-body text-fg-soft">
          {HOW.closing} {HOW.honesty}
        </p>
      </div>
    </Section>
  );
}

// Nib's pose and bubble per sample are drawn on the server and handed to the client sandbox as nodes.
const sandboxNibs: Record<string, ReactNode> = Object.fromEntries(
  Object.entries(TRY.nib).map(([name, n]) => [name, <Nib key={name} pose={n.pose} size={104} title={n.title} />]),
);
const sandboxBubbles: Record<string, ReactNode> = Object.fromEntries(
  Object.entries(TRY.nib).map(([name, n]) => [
    name,
    <SpeechBubble key={name} id={`try-${name}`} tail="bottom-left" className="inline-block">
      {n.bubble}
    </SpeechBubble>,
  ]),
);

export function TrySection() {
  return (
    <Section id="try" title={TRY.title.replace(/\.$/, '')} labelledBy="try-title">
      <h2 id="try-title" className="m-0 font-display text-display-l text-fg">
        <Underlined id="try" text={TRY.title} />
      </h2>
      <p className="mb-0 mt-s3 max-w-prose text-body-l text-fg-soft">{TRY.lead}</p>
      <WideFrame id="try-panel" w={1000} h={470} className="mt-[6.5rem]">
        <Sandbox nibs={sandboxNibs} bubbles={sandboxBubbles} />
      </WideFrame>
      <p className="mb-0 mt-s4 max-w-prose text-body-s text-fg-mute">{TRY.honesty}</p>
      <p className="mb-0 mt-s2 max-w-prose text-body font-semibold text-fg">{TRY.closing}</p>
    </Section>
  );
}

export function InstallSection() {
  return (
    <Section id="install" title={INSTALL.title.replace(/\.$/, '')} labelledBy="install-title">
      <div className="flex items-end justify-between gap-s4">
        <h2 id="install-title" className="m-0 font-display text-display-l text-fg">

          <Underlined id="install" text={INSTALL.title} />

        </h2>
        <div aria-hidden="true" className="flex shrink-0 flex-col items-center gap-s1">
          <p className="nib-voice-s m-0 hidden max-w-[11rem] text-center text-fg-soft md:block">{INSTALL.haulCaption}</p>
          <div className="w-[6rem] md:w-[9.375rem] [&_svg]:h-auto [&_svg]:w-full">

            <Nib pose="haul" size={150} />

          </div>
        </div>
      </div>
      <p className="mb-s6 mt-s3 max-w-prose text-body-l text-fg-soft">{INSTALL.lead}</p>
      <div className="border-t border-rule">
        {INSTALL.ways.map((w) => (
          <div key={w.id} className="grid gap-s3 border-b border-rule py-s5 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:gap-x-s6">
            <div>
              <h3 className="m-0 font-sans text-h3 text-fg">{w.title}</h3>
              <p className="mb-0 mt-s2 text-body-s text-fg-soft">{w.blurb}</p>
            </div>
            <div className="min-w-0">
              <ol className="m-0 flex list-none flex-col gap-s2 p-0">
                {w.rows.map((r) => (
                  <li key={r.id} className="flex items-center gap-s2 rounded-ctl bg-raised py-1 pl-s3 pr-1">
                    <div tabIndex={0} role="region" aria-label={`Command: ${r.label}`} className="min-w-0 flex-1 overflow-x-auto">
                      <code className="block whitespace-nowrap font-mono text-code text-fg">
                        <span aria-hidden="true" className="select-none text-fg-mute">
                          ${' '}
                        </span>
                        {r.command}
                      </code>
                    </div>
                    <CopyButton text={r.command} accessibleName={`Copy ${r.short} command`} className="min-h-11 shrink-0" />
                  </li>
                ))}
              </ol>
              <p className="mb-0 mt-s3 text-body-s text-fg-mute">
                {w.needs}{' '}
                <Link href={w.link.href} className="text-brand underline underline-offset-4 hover:decoration-2">
                  {w.link.label}
                </Link>
                .
              </p>
            </div>
          </div>
        ))}
      </div>
      <p className="mb-0 mt-s5 max-w-prose text-body-s text-fg-mute">
        {INSTALL.early}{' '}
        <Link href="/docs/troubleshooting" className="text-brand underline underline-offset-4 hover:decoration-2">
          {INSTALL.earlyLink}
        </Link>{' '}
        {INSTALL.earlyTail} <Link href="/docs/installation" className="text-brand underline underline-offset-4 hover:decoration-2">{INSTALL.other}</Link>
        {' '}or{' '}
        <Link href="/docs/integrations/slack" className="text-brand underline underline-offset-4 hover:decoration-2">
          {INSTALL.slackLink.toLowerCase()}
        </Link>
        .
      </p>
    </Section>
  );
}

export function FaqSection() {
  return (
    <Section id="faq" title={FAQ_TITLE.replace(/\.$/, '')} labelledBy="faq-title">
      <div className="grid gap-s5 md:grid-cols-[max-content_minmax(0,1fr)] md:gap-x-s7 md:gap-y-s6">
        <h2 id="faq-title" className="m-0 self-start font-display text-display-l text-fg md:sticky md:top-24">
          <Underlined id="faq" text={FAQ_TITLE} />
        </h2>
        <div>
          <Disclosure items={FAQ.map((f) => ({ id: f.id, question: f.question, answer: f.answer }))} />
          <div className="mt-s5 flex items-end gap-s3">
            <div aria-hidden="true" className="w-[5rem] shrink-0 [&_svg]:h-auto [&_svg]:w-full">
              <Nib pose="tilt" size={100} />
            </div>
            <p className="nib-voice m-0 pb-s2 text-fg">{FAQ_SIGNOFF}</p>
          </div>
          <div className="mt-s4 flex flex-wrap items-center gap-x-s5 gap-y-s2">
            {FAQ_CLOSING.map((l) => (
              <Button key={l.href} variant="tertiary" href={l.href}>
                {l.label}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}
