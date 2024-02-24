import { LandingNavbar } from '@/components/landing-navbar';
import { LandingHero } from '@/components/landing-hero';
import { LandingContent } from '@/components/landing-content';

const LandingPage = () => {
  return (
    <main className="h-full bg-[#111827] overflow-auto">
      <div className="mx-auto max-w-screen-xl h-full w-full">
        <div className="h-full">
          <LandingNavbar />
          <LandingHero />
          <LandingContent />
        </div>
      </div>
    </main>
  );
};

export default LandingPage;
