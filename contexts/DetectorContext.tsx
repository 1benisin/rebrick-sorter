// contexts/DetectorContext.tsx

'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import Detector from '@/lib/dualDetector';
import { LoadStatus } from '@/types/loadStatus.type';
import useVideoCapture from '@/hooks/useVideoCapture';

// Define the context type
type DetectorContextType = {
  detector: Detector | null;
  status: LoadStatus;
  reInit: () => Promise<void>;
};

// Create the context
export const DetectorContext = createContext<DetectorContextType | undefined>(undefined);

// Define the provider component
export const DetectorProvider = ({ children }: { children: ReactNode }) => {
  const [detector, setDetector] = useState<Detector | null>(null);
  const [status, setStatus] = useState<LoadStatus>(LoadStatus.Loading);
  const { videoCapture } = useVideoCapture();

  useEffect(() => {
    setStatus(LoadStatus.Loading);

    init();
  }, [videoCapture]);

  const init = async () => {
    if (!videoCapture) {
      setStatus(LoadStatus.Failed);
      setDetector(null);
      return;
    }
    try {
      const localDetector = Detector.getInstance();
      await localDetector.init(videoCapture);
      setDetector(localDetector);
      setStatus(LoadStatus.Loaded);
    } catch (error) {
      setStatus(LoadStatus.Failed);
      setDetector(null);
    }
  };

  const reInit = async () => {
    console.log('Reinitializing detector...');
    setStatus(LoadStatus.Loading);
    if (!videoCapture) {
      setStatus(LoadStatus.Failed);
      return;
    }
    try {
      const localDetector = Detector.getInstance();
      await localDetector.reInit(videoCapture);
      setDetector(localDetector);
      setStatus(LoadStatus.Loaded);
      console.log('Detector reinitialized');
    } catch (error) {
      setStatus(LoadStatus.Failed);
    }
  };

  return <DetectorContext.Provider value={{ detector, status, reInit }}>{children}</DetectorContext.Provider>;
};
