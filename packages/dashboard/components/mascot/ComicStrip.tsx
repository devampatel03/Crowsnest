import type { ReactNode } from 'react';
import './mascot.css';
import { FirstRun1, FirstRun2, FirstRun3, PanelSvg, Scene1, Scene2, Scene3, Scene4, Scene5 } from './scenes';

export interface StripPanel {
  /** Visible caption, real text. Nib voice, max 14 words. */
  caption: string;
  /** What the drawing shows, for screen readers (not repeated visually). */
  description: string;
}

interface StripProps {
  /** Override the default captions (copy-strategist owns the final lines). Length must match the strip. */
  captions?: readonly string[];
  /** Set `data-draw` so MotionGate draws the frames on once when scrolled into view. */
  animate?: boolean;
  className?: string;
}

export const LANDING_PANELS: readonly StripPanel[] = [
  {
    caption: 'You add a package. It joins the line.',
    description: 'Nib the crow sits on the masthead beside a lit lantern. Below, three crates queue at the rail: tidy-dates, fast-csv-lite and a new one.',
  },
  {
    caption: 'One crate is wearing a very familiar name.',
    description: 'Close on two crates. One has a small crown. The crate behind it, quikrequest, wears a fake moustache.',
  },
  {
    caption: 'I check how new it is, who uses it, and how familiar its name looks.',
    description: 'Nib raises the spyglass. A round inset shows the crate tag with three marks: new, almost nobody uses it, name close to a famous one.',
  },
  {
    caption: 'Hold. Not this one.',
    description: 'Nib pulls the bell cord and the bell swings. A small three-notch gauge in the corner reads Hold.',
  },
  {
    caption: 'The rest come aboard. This one waits for you.',
    description: 'The other crates are loaded on the ship. The quikrequest crate waits on the dock with a tag tied to it, while Nib sits back on the perch with a tiny mug.',
  },
];

export const FIRST_RUN_PANELS: readonly StripPanel[] = [
  {
    caption: "The horizon's empty.",
    description: 'Nib sits on an empty deck, looking at a flat horizon line.',
  },
  {
    caption: 'Point me at a folder. I read its lockfile.',
    description: 'Nib holds a rolled paper that stands for package-lock.json, next to a crate.',
  },
  {
    caption: "Then I'll tell you what needs you.",
    description: 'Nib raises the spyglass with the lens lit, looking toward a crate in the distance.',
  },
];

const LANDING_ART: ReactNode[] = [<Scene1 key={1} />, <Scene2 key={2} />, <Scene3 key={3} />, <Scene4 key={4} />, <Scene5 key={5} />];
const FIRST_RUN_ART: ReactNode[] = [<FirstRun1 key={1} />, <FirstRun2 key={2} />, <FirstRun3 key={3} />];

function Strip({
  kind,
  title,
  panels,
  art,
  captions,
  animate,
  className,
  heavy,
}: StripProps & { kind: 'landing' | 'first-run'; title: string; panels: readonly StripPanel[]; art: ReactNode[]; heavy?: number }) {
  const summary = `${title}. ${panels.map((p, i) => `Panel ${i + 1}: ${p.description}`).join(' ')}`;
  return (
    <figure
      className={`nib-strip ${kind}${className ? ` ${className}` : ''}`}
      aria-label={title}
      data-draw={animate ? 'run' : undefined}
    >
      <p className="nib-sr">{summary}</p>
      <ol>
        {panels.map((panel, i) => (
          <li key={i}>
            <PanelSvg heavy={heavy === i}>{art[i]}</PanelSvg>
            <p className="cap">{captions?.[i] ?? panel.caption}</p>
          </li>
        ))}
      </ol>
    </figure>
  );
}

/** Landing: "The night the quikrequest came aboard." Five panels. */
export function ComicStrip(props: StripProps) {
  return <Strip kind="landing" title="The night the quikrequest came aboard" panels={LANDING_PANELS} art={LANDING_ART} heavy={3} {...props} />;
}

/** Console first run: "Point me at a folder." Three panels. */
export function FirstRunStrip(props: StripProps) {
  return <Strip kind="first-run" title="Point me at a folder" panels={FIRST_RUN_PANELS} art={FIRST_RUN_ART} {...props} />;
}
