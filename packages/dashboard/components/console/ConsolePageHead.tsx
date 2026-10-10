import { NibNote } from '@/components/system';

/**
 * Page title row for Lookout, Hold and Log: the one h1, and Nib's note beside it
 * from 1024px up and below it before that. The note is hand-face text only (no
 * art here, so it is safe on every Hold page). It reserves its line so the
 * note arriving causes no layout shift.
 */
export function ConsolePageHead({ title, note }: { title: string; note: string | null }) {
  return (
    <header className="flex flex-col gap-s1 py-s4 lg:flex-row lg:items-baseline lg:gap-s4">
      <h1 className="m-0 font-sans text-h2 text-fg">{title}</h1>
      <div className="min-h-[1.625rem]" title={note ? "Nib's note" : undefined}>{note ? <NibNote size="m">{note}</NibNote> : null}</div>
    </header>
  );
}
