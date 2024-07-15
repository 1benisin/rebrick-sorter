// contexts/RootProvider.tsx

'use client';

import { SocketProvider } from '@/contexts/SocketContext';
import { ClassifierProvider } from '@/contexts/ClassifierContext';
import { SettingsProvider } from '@/contexts/SettingsContext';
import { HardwareProvider } from '@/contexts/HardwareContext';
import { DetectorProvider } from '@/contexts/DetectorContext';
import { VideoCaptureProvider } from '@/contexts/VideoCaptureContext';
import { SortControllerProvider } from '@/contexts/SortControllerContext';

export default async function RootProvider({ children }: { children: React.ReactNode }) {
  return (
    <SettingsProvider>
      <SocketProvider>
        <ClassifierProvider>
          <HardwareProvider>
            <VideoCaptureProvider>
              <DetectorProvider>
                <SortControllerProvider> {children} </SortControllerProvider>
              </DetectorProvider>
            </VideoCaptureProvider>
          </HardwareProvider>
        </ClassifierProvider>
      </SocketProvider>
    </SettingsProvider>
  );
}
