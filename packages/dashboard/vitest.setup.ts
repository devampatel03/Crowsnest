import '@testing-library/jest-dom/vitest';

// jsdom does not implement ResizeObserver (needed by recharts'
// <ResponsiveContainer>) or Element.scrollIntoView (used by the live
// firehose auto-scroll effect). Stub both so chart-bearing pages can mount
// in a smoke test without throwing.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = globalThis.ResizeObserver || (ResizeObserverStub as unknown as typeof ResizeObserver);

if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// jsdom implements neither IntersectionObserver (Motion's `whileInView`,
// used by the landing page's Reveal component) nor matchMedia (Motion's
// `useReducedMotion`). Stub both so the landing-page smoke test can mount.
class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

globalThis.IntersectionObserver =
  globalThis.IntersectionObserver || (IntersectionObserverStub as unknown as typeof IntersectionObserver);

if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList;
}
