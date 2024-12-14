// app/layout.tsx

import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import AlertDisplay from '@/components/AlertDisplay';
import ServiceInitializer from '@/components/ServiceInitializer';
import NavBar from '@/components/navbar';
import { Toaster } from '@/components/ui/toaster';

const font = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Rebrick',
  description: 'Lego Sorting App',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={font.className}>
        <NavBar />
        <AlertDisplay />
        <ServiceInitializer>{children}</ServiceInitializer>
        <Toaster />
      </body>
    </html>
  );
}
