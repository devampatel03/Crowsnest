import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

type Opts = {
  smoothWheel: boolean;
  syncTouch: boolean;
  allowNestedScroll?: boolean;
  prevent: (n: HTMLElement) => boolean;
  virtualScroll: (d: { deltaX: number; deltaY: number; event: { type: string } }) => boolean;
};
const instances: { opts: Opts; targetScroll: number; animatedScroll: number; limit: number; stop: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn>; scrollTo: ReturnType<typeof vi.fn> }[] = [];

vi.mock('lenis/dist/lenis.css', () => ({}));
vi.mock('lenis', () => ({
  default: class {
    opts: Opts;
    targetScroll = 0;
    animatedScroll = 0;
    limit = 5000;
    stop = vi.fn();
    start = vi.fn();
    destroy = vi.fn();
    scrollTo = vi.fn();
    constructor(opts: Opts) {
      this.opts = opts;
      instances.push(this as never);
    }
  },
}));

import { SmoothScroll } from './SmoothScroll';

const wheel = (deltaY: number) => ({ deltaX: 0, deltaY, event: { type: 'wheel' } });

describe('SmoothScroll', () => {
  it('renders nothing, smooths the wheel but not touch, and decides nested scrolling itself', () => {
    const { container } = render(<SmoothScroll />);
    expect(container).toBeEmptyDOMElement();
    const { opts } = instances[instances.length - 1];
    expect(opts.smoothWheel).toBe(true);
    expect(opts.syncTouch).toBe(false);
    expect(opts.allowNestedScroll).toBeUndefined();
  });

  it('caps one wheel event, in both directions, and never sends a zero delta', () => {
    render(<SmoothScroll />);
    const l = instances[instances.length - 1];
    const down = wheel(900);
    l.opts.virtualScroll(down);
    expect(down.deltaY).toBe(140);
    const up = wheel(-900);
    l.opts.virtualScroll(up);
    expect(up.deltaY).toBe(-140);
    // Target already a full screen ahead: the next flick still moves, but only by 1px.
    l.targetScroll = 5000;
    l.animatedScroll = 3000;
    const more = wheel(100);
    l.opts.virtualScroll(more);
    expect(more.deltaY).toBe(1);
    // Reversing is allowed at full speed.
    const back = wheel(-100);
    l.opts.virtualScroll(back);
    expect(back.deltaY).toBe(-100);
  });

  it('lets only an element with real vertical overflow take the wheel', () => {
    render(<SmoothScroll />);
    const { opts } = instances[instances.length - 1];
    opts.virtualScroll(wheel(100));
    const box = document.createElement('div');
    box.style.overflowY = 'auto';
    Object.defineProperty(box, 'scrollHeight', { value: 301, configurable: true });
    Object.defineProperty(box, 'clientHeight', { value: 300, configurable: true });
    expect(opts.prevent(box)).toBe(false); // a one-pixel overflow is not a scroller
    Object.defineProperty(box, 'scrollHeight', { value: 900, configurable: true });
    expect(opts.prevent(box)).toBe(true); // real overflow, room below
    box.scrollTop = 600;
    expect(opts.prevent(box)).toBe(false); // at the bottom, the page takes over
    opts.virtualScroll(wheel(-100));
    expect(opts.prevent(box)).toBe(true); // going back up, the box scrolls again
  });

  it('pauses while a dialog locks the page and cleans up on unmount', async () => {
    const { unmount } = render(<SmoothScroll />);
    const lenis = instances[instances.length - 1];
    document.body.setAttribute('data-scroll-locked', '1');
    await new Promise((r) => setTimeout(r, 0));
    expect(lenis.stop).toHaveBeenCalled();
    document.body.removeAttribute('data-scroll-locked');
    await new Promise((r) => setTimeout(r, 0));
    expect(lenis.start).toHaveBeenCalled();
    unmount();
    expect(lenis.destroy).toHaveBeenCalled();
  });

  it('glides for the keyboard instead of jumping', () => {
    render(<SmoothScroll />);
    const lenis = instances[instances.length - 1];
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', cancelable: true }));
    expect(lenis.scrollTo).toHaveBeenCalledWith(5000, { duration: 0.9 });
  });
});
