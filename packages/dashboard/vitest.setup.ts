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
