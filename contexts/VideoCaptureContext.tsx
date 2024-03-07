'use client';
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import DualVideoCapture from '@/lib/dualVideoCapture';
import { sortProcessStore } from '@/stores/sortProcessStore';
import { LoadStatus } from '@/types/loadStatus.type';

// Define the context type
type VideoCaptureContextType = {
  videoCapture: DualVideoCapture | null;
  status: LoadStatus;
  init: () => Promise<void>;
};

// Create the context
export const VideoCaptureContext = createContext<VideoCaptureContextType | undefined>(undefined);

// Define the provider component
export const VideoCaptureProvider = ({ children }: { children: ReactNode }) => {
  const [status, setStatus] = useState<LoadStatus>(LoadStatus.Loading);
  const [videoCapture, setVideoCapture] = useState<DualVideoCapture | null>(null);
  const videoStreamId = sortProcessStore((state) => state.videoStreamId);

  useEffect(() => {
    setStatus(LoadStatus.Loading);
    init();
  }, [videoStreamId]);

  const init = async () => {
    try {
      if (!videoStreamId) {
        console.log('No video stream id available.');
        setVideoCapture(null);
        setStatus(LoadStatus.Failed);
        return;
      }
      const localVideoCapture = DualVideoCapture.getInstance();
      await localVideoCapture.init(videoStreamId);
      setVideoCapture(localVideoCapture);
      setStatus(LoadStatus.Loaded);
      console.log('VIDEO CAPTURE INITIALIZED');
    } catch (error) {
      console.error('Failed to initialize video capture:', error);
      setVideoCapture(null);
      setStatus(LoadStatus.Failed);
    }
  };

  return <VideoCaptureContext.Provider value={{ videoCapture, status, init }}>{children}</VideoCaptureContext.Provider>;
};
