import type { Metadata } from 'next';
import { FaqSection, HeroSection, HowSection, InstallSection, TrySection } from '@/components/landing/Sections';
import { JsonLd } from '@/components/seo/JsonLd';
import { NibClimber, NibMini } from '@/components/mascot';
import { BearingRule } from '@/components/system/BearingRule';
import { WaveRule } from '@/components/system/WaveRule';
import { FAQ, HERO, HOW, INSTALL, INSTALL_STEPS, TRY, FAQ_TITLE } from '@/lib/content/landing';
import { faqPage, howTo, softwareApplication } from '@/lib/seo/jsonld';
import { LANDING_DESCRIPTION } from '@/lib/seo/landing';
import { buildMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = buildMetadata({ path: '/', title: null, description: LANDING_DESCRIPTION });

const strip = (s: string) => s.replace(/\.$/, '');
// The five Bearing Rule majors are exactly the five sections, in order.
const SECTIONS = [
  { id: 'top', title: strip(HERO.h1), label: 'Start' },
  { id: 'how', title: strip(HOW.title), label: 'How it works' },
  { id: 'try', title: strip(TRY.title), label: 'Try it' },
  { id: 'install', title: strip(INSTALL.title), label: 'Install' },
  { id: 'faq', title: strip(FAQ_TITLE), label: 'Questions' },
];

export default function Landing() {
  return (
    <>
      <JsonLd
        data={[
          softwareApplication(),
          faqPage(FAQ.map((f) => ({ question: f.question, answer: f.answer }))),
          howTo(INSTALL_STEPS, { name: INSTALL.howToName, description: INSTALL.lead, path: '/' }),
        ]}
      />
      <div className="mx-auto max-w-shell px-s4 md:grid md:grid-cols-[144px_minmax(0,1fr)] md:gap-x-s5">
        <div className="md:col-start-1 md:row-start-1">
          <BearingRule variant="site" sections={SECTIONS} marker={<NibClimber size={52} />} markerCompact={<NibMini size={20} />} ringAt="install" className="md:w-36" />
        </div>
        <div className="min-w-0 md:col-start-2 md:row-start-1">
          <div className="band band-canvas">
            <HeroSection />
          </div>
          <div className="band band-sand">
            <WaveRule id="wave-how" />
            <HowSection />
          </div>
          <div className="band band-canvas">
            <WaveRule id="wave-try" />
            <TrySection />
          </div>
          <div className="band band-honey">
            <WaveRule id="wave-install" />
            <InstallSection />
          </div>
          <div className="band band-sand">
            <WaveRule id="wave-faq" />
            <FaqSection />
          </div>
        </div>
      </div>
    </>
  );
}
