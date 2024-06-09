import { LandingNavbar } from '@/components/landing-navbar';
import { LandingHero } from '@/components/landing-hero';
import { LandingContent } from '@/components/landing-content';

const LandingPage = () => {
  return (
    <main className="h-full overflow-auto bg-[#111827]">
      <div className="mx-auto h-full w-full max-w-screen-xl">
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
