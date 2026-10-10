import type { ReactNode } from 'react';
import { Nib, type NibPose } from './Nib';

/**
 * Illustrated states. Each is a pose plus one plain sentence in Nib's voice.
 * The art is decorative: the sentence carries the meaning. Never put ErrorNib
 * or any wink on a Hold screen; Hold states stay factual and quiet.
 */
interface StateProps {
  /** Replace the default sentence (copy-strategist's final line). */
  text?: string;
  /** Actions or the plain explanation, rendered under the sentence. */
  children?: ReactNode;
  size?: number;
  className?: string;
}

function State({
  pose,
  text,
  children,
  size = 140,
  className,
  role,
  animate,
}: StateProps & { pose: NibPose; text: string; role?: 'status' | 'alert'; animate?: boolean }) {
  return (
    <div className={`nib-state${className ? ` ${className}` : ''}`} role={role}>
      <Nib pose={pose} size={size} animate={animate} />
      <div>
        <p>{text}</p>
        {children}
      </div>
    </div>
  );
}

export function EmptyNib(props: StateProps) {
  return <State pose="quiet" text="Nothing to show yet. Scan a project and I'll take a look." {...props} />;
}

export function LoadingNib(props: StateProps) {
  return <State pose="spy" animate role="status" text="Checking your packages…" {...props} />;
}

export function ErrorNib(props: StateProps) {
  return <State pose="oops" role="alert" text="Something slipped on our side." {...props} />;
}

export function OfflineNib(props: StateProps) {
  return <State pose="lantern" text="My lantern's out." {...props} />;
}

export function NotFoundNib(props: StateProps) {
  return <State pose="lost" text="That page isn't here. I checked the whole horizon." {...props} />;
}

export function SuccessNib(props: StateProps) {
  return <State pose="nod" role="status" text="Done. Nib's back with the results." {...props} />;
}
