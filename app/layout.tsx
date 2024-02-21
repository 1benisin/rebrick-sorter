import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import NavBar from '@/components/navbar';
import AlertDisplay from '@/components/AlertDisplay';

import './globals.css';

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
        {children}
      </body>
    </html>
  );
}
