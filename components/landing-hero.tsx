// components/landing-hero.tsx

'use client';

import Link from 'next/link';
// import { useAuth } from "@clerk/nextjs";

import { Button } from '@/components/ui/button';

export const LandingHero = () => {
  // const { isSignedIn } = useAuth();

  return (
    <div className="space-y-5 py-36 text-center font-bold text-white">
      <div className="space-y-5 text-4xl font-extrabold sm:text-5xl md:text-6xl lg:text-7xl">
        <h1>Automated Lego Sorting</h1>
      </div>
      <div className="text-sm font-light text-zinc-400 md:text-xl">Sort Lego using AI 10x faster.</div>
      <div>
        {/* <Link href={isSignedIn ? "/dashboard" : "/sign-up"}> */}
        <Link href="/dashboard">
          <Button type="button" variant="premium" className="rounded-full p-4 font-semibold md:p-6 md:text-lg">
            Start Generating For Free
          </Button>
        </Link>
      </div>
      <div className="text-xs font-normal text-zinc-400 md:text-sm">No credit card required.</div>
    </div>
  );
};
