import '@/components/mascot/mascot.css';
import { PanelSvg, Scene1, Scene2, Scene3, Scene4, Scene5 } from '@/components/mascot/scenes';
import { HOW } from '@/lib/content/landing';

const SCENES = [<Scene1 key={1} />, <Scene2 key={2} />, <Scene3 key={3} />, <Scene4 key={4} />, <Scene5 key={5} />];

/**
 * "The night the quikrequest came aboard": five panels in the mascot's comic
 * layout (wide panel 1, then 2 above 3 across). Captions are real text in the
 * hand face; the drawings are decorative, and the full text equivalent sits
 * in the figcaption for screen readers. MotionGate draws the frames once when
 * the strip is a quarter visible (data-draw); reduced motion shows them drawn.
 */
export function LandingStrip() {
  return (
    <figure className="nib-strip landing m-0" data-draw="on" aria-labelledby="strip-title">
      <h3 id="strip-title" className="sr-only">
        {HOW.stripTitle}
      </h3>
      <ol>
        {SCENES.map((scene, i) => (
          <li key={i}>
            <PanelSvg heavy={i === 3}>{scene}</PanelSvg>
            <p className="nib-voice m-0 mt-s2 text-fg">{HOW.captions[i]}</p>
          </li>
        ))}
      </ol>
      <figcaption className="sr-only">{HOW.stripAlt}</figcaption>
    </figure>
  );
}
