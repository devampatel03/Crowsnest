import { Nib } from '@/components/mascot';

/** Page-end sign-off: Nib waves (decorative) and the line is real text in the hand face. */
export function SignOff({ children }: { children: string }) {
  return (
    <div className="mt-s6 flex max-w-prose items-end gap-s3" data-signoff>
      <div aria-hidden="true" className="w-[3rem] shrink-0 [&_svg]:h-auto [&_svg]:w-full">
        <Nib pose="wave" size={48} />
      </div>
      <p className="nib-voice m-0 pb-1 text-fg">{children}</p>
    </div>
  );
}
