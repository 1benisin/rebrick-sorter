// app/layout.tsx

import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import AlertDisplay from '@/components/AlertDisplay';
import RootContextProvider from '@/contexts/RootProvider';
import NavBar from '@/components/Navbar';

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

        <RootContextProvider>{children}</RootContextProvider>
      </body>
    </html>
  );
}
