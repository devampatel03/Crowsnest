import { readFileSync } from 'node:fs';
import path from 'node:path';
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MotionGate } from './MotionGate';
import { NibNote } from './NibNote';
import { Rope } from './Rope';
import { SketchFrame, SpeechBubble } from './SketchFrame';
import { SketchSky } from './SketchSky';
import { Squiggle } from './Squiggle';
import { WaveRule } from './WaveRule';
import { hashSeed, sketchRectPath, squiggleVariantFor, wavePath } from './sketch-path';

const css = readFileSync(path.resolve(__dirname, '../../app/globals.css'), 'utf8');
const reduce = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));

describe('seeded paths', () => {
  it('same seed gives the same path, different seeds differ', () => {
    expect(sketchRectPath('panel-1')).toBe(sketchRectPath('panel-1'));
    expect(sketchRectPath('panel-1')).not.toBe(sketchRectPath('panel-2'));
    expect(wavePath('a')).toBe(wavePath('a'));
    expect(wavePath('a')).not.toBe(wavePath('b'));
    expect(hashSeed('x')).toBe(hashSeed('x'));
  });
  it('picks a stable squiggle variant 1..3', () => {
    for (const id of ['how', 'try', 'install', 'faq', 'x']) {
      const v = squiggleVariantFor(id);
      expect([1, 2, 3]).toContain(v);
      expect(squiggleVariantFor(id)).toBe(v);
    }
  });
  it('bubble tails change the outline', () => {
    expect(sketchRectPath('b', { tail: 'bottom-left' })).not.toBe(sketchRectPath('b'));
    expect(sketchRectPath('b', { tail: 'bottom-right' })).not.toBe(sketchRectPath('b'));
  });
});

describe('SketchFrame', () => {
  it('renders an aria-hidden, non-scaling, stretched frame and keeps content semantics', () => {
    const { container } = render(
      <SketchFrame id="panel-1" tone="panel">
        <p>caption</p>
      </SketchFrame>,
    );
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('preserveAspectRatio', 'none');
    const p = svg.querySelector('path')!;
    expect(p).toHaveAttribute('vector-effect', 'non-scaling-stroke');
    expect(p).toHaveAttribute('pathLength', '1');
    expect(p).toHaveClass('sketch-path', 'stroke-fg-mute');
    expect(screen.getByText('caption')).toBeInTheDocument();
  });
  it('is identical on repeat renders (no hydration drift)', () => {
    const a = render(<SketchFrame id="same" />).container.innerHTML;
    const b = render(<SketchFrame id="same" />).container.innerHTML;
    expect(a).toBe(b);
  });
  it('SpeechBubble uses the hand face', () => {
    const { container } = render(<SpeechBubble id="b">Hold. Not this one.</SpeechBubble>);
    expect(container.querySelector('.nib-voice')).toHaveTextContent('Hold. Not this one.');
  });
});

describe('WaveRule, Squiggle, Sky, NibNote, Rope', () => {
  it('WaveRule is decorative and draws over 700ms', () => {
    const { container } = render(<WaveRule id="s1" />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('svg')).toHaveStyle({ '--draw-ms': '700ms' });
  });
  it('Squiggle keeps the word readable and hides the line', () => {
    const { container } = render(
      <h2>
        How it protects <Squiggle id="how">you.</Squiggle>
      </h2>,
    );
    expect(screen.getByRole('heading', { name: 'How it protects you.' })).toBeInTheDocument();
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
  it('Sky is aria-hidden and ambient, with two layers of two copies and no stars', () => {
    const { container } = render(<SketchSky />);
    const sky = container.firstElementChild!;
    expect(sky).toHaveAttribute('aria-hidden', 'true');
    expect(sky).toHaveAttribute('data-ambient');
    expect(container.querySelectorAll('.sky-layer')).toHaveLength(2);
    expect(container.querySelectorAll('.sky-layer > svg')).toHaveLength(4);
    expect(container.querySelectorAll('circle')).toHaveLength(2); // one moon ring, twice for the seamless copy
  });
  it('NibNote renders text, and the pose slot is aria-hidden', () => {
    render(<NibNote pose={<i data-testid="pose" />}>All quiet from up here.</NibNote>);
    expect(screen.getByText('All quiet from up here.')).toHaveClass('nib-voice');
    expect(screen.getByTestId('pose').parentElement).toHaveAttribute('aria-hidden', 'true');
  });
  it('Rope is decorative', () => {
    const { container } = render(<Rope />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('MotionGate', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-motion');
    vi.unstubAllGlobals();
  });

  it('sets data-motion=off when the tab is hidden and clears it when visible', () => {
    render(<MotionGate />);
    let hidden = true;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(document.documentElement).toHaveAttribute('data-motion', 'off');
    hidden = false;
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(document.documentElement).not.toHaveAttribute('data-motion');
  });

  it('flags ambient blocks in or out of view and flips held draw-ons to run, once', () => {
    type FakeIO = { cb: IntersectionObserverCallback; els: Element[] };
    const observers: FakeIO[] = [];
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        els: Element[] = [];
        cb: IntersectionObserverCallback;
        constructor(cb: IntersectionObserverCallback) {
          this.cb = cb;
          observers.push(this as unknown as FakeIO);
        }
        observe(el: Element) {
          this.els.push(el);
        }
        unobserve() {}
        disconnect() {}
      },
    );
    render(
      <>
        <div data-ambient data-testid="amb" />
        <div data-draw="on" data-testid="drw" />
        <MotionGate />
      </>,
    );
    const amb = screen.getByTestId('amb');
    const drw = screen.getByTestId('drw');
    const entry = (target: Element, isIntersecting: boolean) => [{ target, isIntersecting }] as unknown as IntersectionObserverEntry[];
    const [ambientIO, drawIO] = observers;
    expect(ambientIO.els).toContain(amb);
    expect(drawIO.els).toContain(drw);
    act(() => ambientIO.cb(entry(amb, false), ambientIO as never));
    expect(amb).toHaveAttribute('data-inview', 'false');
    act(() => ambientIO.cb(entry(amb, true), ambientIO as never));
    expect(amb).toHaveAttribute('data-inview', 'true');
    drw.setAttribute('data-draw', 'pending');
    act(() => drawIO.cb(entry(drw, true), drawIO as never));
    expect(drw).toHaveAttribute('data-draw', 'run');
  });

  it('holds nothing under reduced motion (everything stays drawn)', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: q.includes('reduce'),
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }));
    const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ top: 5000 } as DOMRect);
    render(
      <>
        <div data-draw="on" data-testid="drw" />
        <MotionGate />
      </>,
    );
    expect(screen.getByTestId('drw')).toHaveAttribute('data-draw', 'on');
    spy.mockRestore();
  });

  it('holds a below-the-fold draw-on when motion is allowed', () => {
    const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ top: 5000 } as DOMRect);
    render(
      <>
        <div data-draw="on" data-testid="drw" />
        <MotionGate />
      </>,
    );
    expect(screen.getByTestId('drw')).toHaveAttribute('data-draw', 'pending');
    spy.mockRestore();
  });
});

describe('reduced motion has a static fallback for every v3 animation', () => {
  it('draw-on: fully drawn, no dash, no animation', () => {
    expect(reduce).toMatch(/\[data-draw\] \.sketch-path,\s*\[data-draw='pending'\] \.sketch-path \{[^}]*animation: none !important[^}]*stroke-dashoffset: 0 !important/);
  });
  it('sky: no drift, no transform', () => {
    expect(reduce).toMatch(/\.sky-layer \{[^}]*animation: none !important[^}]*transform: none !important/);
  });
  it('rope crow: snaps (no transition) and does not ring', () => {
    expect(reduce).toMatch(/\.rope-marker,\s*\.rope-marker-h \{[^}]*transition: none !important[^}]*animation: none !important/);
  });
  it('every v3 animation is declared, and the global reduced rule collapses the rest', () => {
    const used = [...css.matchAll(/animation:\s*([a-z-]+)\s/g)].map((m) => m[1]);
    for (const name of ['draw-on', 'sky-drift', 'rope-ring']) expect(used).toContain(name);
    expect(reduce).toMatch(/animation-duration: 0\.001ms !important/);
    expect(reduce).toMatch(/animation-iteration-count: 1 !important/);
  });
  it('ambient loops pause offscreen and when the tab is hidden', () => {
    expect(css).toMatch(/\[data-ambient\]\[data-inview='false'\]/);
    expect(css).toMatch(/html\[data-motion='off'\] \[data-ambient\]/);
  });
  it('the dash is set only in the keyframes and the pending hold, so a settled stroke is solid', () => {
    const count = (css.match(/stroke-dasharray:\s*1;/g) ?? []).length;
    expect(count).toBe(3); // keyframes from, keyframes to, pending hold
  });
});
