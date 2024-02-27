import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import NavBar from '@/components/navbar';
import AlertDisplay from '@/components/AlertDisplay';
import { SocketProvider } from '@/contexts/SocketContext';
import { ClassifierProvider } from '@/contexts/ClassifierContext';
import { SettingsProvider } from '@/contexts/SettingsContext';
import { HardwareProvider } from '@/contexts/HardwareContext';
import { DetectorProvider } from '@/contexts/DetectorContext';
import { VideoCaptureProvider } from '@/contexts/VideoCaptureContext';
import { SortControllerProvider } from '@/contexts/SortControllerContext';

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

        <SettingsProvider>
          <SocketProvider>
            <VideoCaptureProvider>
              <ClassifierProvider>
                <HardwareProvider>
                  <DetectorProvider>
                    <SortControllerProvider> {children} </SortControllerProvider>
                  </DetectorProvider>
                </HardwareProvider>
              </ClassifierProvider>
            </VideoCaptureProvider>
          </SocketProvider>
        </SettingsProvider>
      </body>
    </html>
  );
}
