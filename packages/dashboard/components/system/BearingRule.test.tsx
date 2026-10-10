import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BearingRule, bearingFor, minorTickCount, ropeProgress, withBearings } from './BearingRule';

describe('bearingFor', () => {
  it('spaces sections evenly around the circle (5 sections)', () => {
    expect([0, 1, 2, 3, 4].map((i) => bearingFor(i, 5))).toEqual(['000°', '072°', '144°', '216°', '288°']);
  });
  it('spaces six sections at 60 degrees', () => {
    expect([0, 1, 2, 5].map((i) => bearingFor(i, 6))).toEqual(['000°', '060°', '120°', '300°']);
  });
  it('rounds uneven splits, never reaches 360 and never goes negative', () => {
    expect([0, 1, 2].map((i) => bearingFor(i, 3))).toEqual(['000°', '120°', '240°']);
    expect(bearingFor(6, 7)).toBe('309°');
    expect(bearingFor(-1, 4)).toBe('270°');
    expect(bearingFor(0, 0)).toBe('000°');
  });
  it('withBearings derives labels from the list length', () => {
    const out = withBearings([
      { id: 'a', title: 'A' },
      { id: 'b', title: 'B' },
    ]);
    expect(out.map((s) => s.bearing)).toEqual(['000°', '180°']);
  });
});

describe('minorTickCount', () => {
  it('caps at five and floors at zero', () => {
    expect(minorTickCount(-3)).toBe(0);
    expect(minorTickCount(3)).toBe(3);
    expect(minorTickCount(40)).toBe(5);
  });
});

describe('BearingRule', () => {
  const sections = [
    { id: 'top', title: 'Hero' },
    { id: 'how', title: 'How it protects you' },
    { id: 'try', title: 'Check a name' },
  ];

  it('renders every derived bearing as a link to its section in the first render', () => {
    render(<BearingRule variant="site" sections={sections} />);
    expect(screen.getByRole('link', { name: /000°/ })).toHaveAttribute('href', '#top');
    expect(screen.getByRole('link', { name: /120°/ })).toHaveAttribute('href', '#how');
    expect(screen.getByRole('link', { name: /240°/ })).toHaveAttribute('href', '#try');
  });

  it('ignores a hand-set bearing and derives it from the count', () => {
    render(<BearingRule variant="site" sections={[{ id: 'a', title: 'A', bearing: '045°' }, { id: 'b', title: 'B' }]} />);
    expect(screen.queryByRole('link', { name: /045°/ })).toBeNull();
    expect(screen.getByRole('link', { name: /180°/ })).toBeInTheDocument();
  });

  it('marks the first section as current and shows its title beside the active tick only', () => {
    render(<BearingRule variant="site" sections={sections} />);
    expect(screen.getByRole('link', { name: /000°/ })).toHaveAttribute('aria-current', 'location');
    expect(screen.getByRole('link', { name: /120°/ })).not.toHaveAttribute('aria-current');
    // One visible (aria-hidden) title for the active tick; others are sr-only.
    expect(document.querySelectorAll('nav a span[aria-hidden="true"].leading-tight')).toHaveLength(1);
  });

  it('uses the signal yellow for the active knot', () => {
    const { container } = render(<BearingRule variant="site" sections={sections} />);
    expect(container.querySelector('nav a span.bg-cta')).not.toBeNull();
  });

  it('exposes a segmented progress bar for small screens', () => {
    render(<BearingRule variant="site" sections={sections} />);
    const bar = screen.getByRole('progressbar', { name: 'Reading progress' });
    expect(bar).toHaveAttribute('aria-valuemax', '3');
    expect(bar).toHaveAttribute('aria-valuenow', '1');
  });

  it('console variant is decorative and carries the live status on the tip', () => {
    const { container } = render(
      <BearingRule variant="console" live={{ status: 'reconnecting', text: 'Reconnecting…' }} />,
    );
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    const tip = container.querySelector('[data-live-status="reconnecting"]');
    expect(tip).not.toBeNull();
    // Hollow tip for non-live states: no solid fill class.
    expect(tip).not.toHaveClass('bg-brand');
  });

  it('console tip is a solid beam square when live or scanning, and never blinks', () => {
    const { container, rerender } = render(<BearingRule variant="console" live={{ status: 'live', text: 'Live' }} />);
    expect(container.querySelector('[data-live-status="live"]')).toHaveClass('bg-brand', 'size-1.5');
    rerender(<BearingRule variant="console" live={{ status: 'scanning', text: 'Scanning' }} />);
    const tip = container.querySelector('[data-live-status="scanning"]');
    expect(tip).toHaveClass('bg-brand');
    expect(tip?.className).not.toMatch(/blink/);
  });
});

describe('ropeProgress (v3 rope marker)', () => {
  const tops = [0, 1000, 2000, 3000];
  it('is 0 before the first section and rises monotonically to 1', () => {
    expect(ropeProgress(tops, -50, 4000)).toBe(0);
    expect(ropeProgress(tops, 0, 4000)).toBe(0);
    expect(ropeProgress(tops, 500, 4000)).toBeCloseTo(0.125);
    expect(ropeProgress(tops, 1000, 4000)).toBeCloseTo(0.25);
    expect(ropeProgress(tops, 3500, 4000)).toBeCloseTo(0.875);
    expect(ropeProgress(tops, 9999, 4000)).toBe(1);
    expect(ropeProgress([], 10, 10)).toBe(0);
  });
});

describe('BearingRule v3', () => {
  const sections = [
    { id: 'top', title: 'Hero' },
    { id: 'install', title: 'Install' },
  ];
  it('renders the rope, knots and the default marker, all decorative', () => {
    const { container } = render(<BearingRule variant="site" sections={sections} />);
    expect(container.querySelector('nav svg[data-rope="vertical"]')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelectorAll('nav a [data-knot="major"]')).toHaveLength(2);
    expect(container.querySelector('[data-rope-marker]')).toHaveAttribute('aria-hidden', 'true');
  });
  it('renders the crow passed as marker (illustrator slot)', () => {
    const { container } = render(<BearingRule variant="site" sections={sections} marker={<i data-testid="crow" />} />);
    expect(screen.getAllByTestId('crow').length).toBeGreaterThan(0);
    expect(container.querySelector('[data-rope-marker-h]')).toBeInTheDocument();
  });
  it('console variant can carry the lantern instead of the square tip', () => {
    const { container } = render(
      <BearingRule variant="console" live={{ status: 'live', text: 'Live' }} lantern={<i data-testid="lantern" />} />,
    );
    expect(container.querySelector('[data-live-status="live"] [data-testid="lantern"]')).not.toBeNull();
  });
  it('rings once on arriving at the target section', async () => {
    const onRing = vi.fn();
    const els = [
      ['top', 0],
      ['install', 1000],
    ].map(([id, top]) => {
      const el = document.createElement('section');
      el.id = id as string;
      el.getBoundingClientRect = () => ({ top: (top as number) - window.scrollY, bottom: (top as number) + 900 - window.scrollY }) as DOMRect;
      document.body.appendChild(el);
      return el;
    });
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 1;
    });
    const scrollTo = async (y: number) => {
      Object.defineProperty(window, 'scrollY', { configurable: true, value: y });
      await act(async () => {
        window.dispatchEvent(new Event('scroll'));
      });
    };
    const { container } = render(<BearingRule variant="site" sections={sections} ringAt="install" onRing={onRing} />);
    expect(onRing).not.toHaveBeenCalled();
    await scrollTo(900);
    expect(onRing).toHaveBeenCalledTimes(1);
    expect(onRing).toHaveBeenCalledWith('install');
    expect(container.querySelector('[data-rope-marker]')).toHaveAttribute('data-ring', 'true');
    await scrollTo(0);
    await scrollTo(900);
    expect(onRing).toHaveBeenCalledTimes(1); // once per page view
    raf.mockRestore();
    els.forEach((e) => e.remove());
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
  });
  it('does not ring under reduced motion', async () => {
    const onRing = vi.fn();
    const orig = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    const els = [
      ['top', 0],
      ['install', 1000],
    ].map(([id, top]) => {
      const el = document.createElement('section');
      el.id = id as string;
      el.getBoundingClientRect = () => ({ top: (top as number) - window.scrollY, bottom: (top as number) + 900 - window.scrollY }) as DOMRect;
      document.body.appendChild(el);
      return el;
    });
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 1;
    });
    render(<BearingRule variant="site" sections={sections} ringAt="install" onRing={onRing} />);
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 900 });
    await act(async () => {
      window.dispatchEvent(new Event('scroll'));
    });
    expect(onRing).not.toHaveBeenCalled();
    raf.mockRestore();
    els.forEach((e) => e.remove());
    window.matchMedia = orig;
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
  });
});
