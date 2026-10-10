import { NibMini } from '@/components/mascot';

/**
 * Rail foot: Nib's head with a small lantern. Lit (a beam flame) when the
 * stream is connected, unlit (an empty cage, no flame) when it is not. The
 * state is also said in words by the caller's accessible name, so the flame
 * is never the only signal. Colours come from tokens only.
 */
export function RailLantern({ lit }: { lit: boolean }) {
  return (
    <span aria-hidden="true" data-rail-lantern={lit ? 'lit' : 'unlit'} className="flex items-end gap-[2px]">
      <NibMini size={24} />
      <svg width="14" height="22" viewBox="0 0 14 22" fill="none" className="shrink-0 text-nib-line" focusable="false">
        <path d="M4 5 Q7 0 10 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M3 5 H11 V8 H3 Z M3.5 8 H10.5 L12 19 H2 Z M2 19 H12 V21 H2 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" className="fill-nib-fill" />
        {lit ? <path d="M7 10 C9.4 12.4 9.4 15 7 17 C4.6 15 4.6 12.4 7 10 Z" className="fill-brand stroke-brand" strokeWidth="1" strokeLinejoin="round" /> : null}
      </svg>
    </span>
  );
}
