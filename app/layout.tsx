// app/layout.tsx

import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import AlertDisplay from '@/components/AlertDisplay';
import Navbar from '@/components/Navbar';
import ServiceInitializer from '@/components/ServiceInitializer';

const font = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Rebrick',
  description: 'Lego Sorting App',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={font.className}>
        <Navbar />
        <AlertDisplay />

        <ServiceInitializer>{children}</ServiceInitializer>
      </body>
    </html>
  );
}
