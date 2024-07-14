// contexts/SortControllerContext.tsx

'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import SortProcessCtrl from '@/lib/sortProcessCtrl';
import useDetector from '@/hooks/useDetector';
import useSettings from '@/hooks/useSettings';
import useClassifier from '@/hooks/useClassifier';
import { LoadStatus } from '@/types/loadStatus.type';

// Define the context type
type SortControllerContextType = {
  controller: SortProcessCtrl | null;
  status: LoadStatus;
};

// Create the context
export const SortControllerContext = createContext<SortControllerContextType | undefined>(undefined);

// Define the provider component
export const SortControllerProvider = ({ children }: { children: ReactNode }) => {
  const [controller, setController] = useState<SortProcessCtrl | null>(null);
  const [status, setStatus] = useState<LoadStatus>(LoadStatus.Loading);
  const { detector } = useDetector();
  const { settings } = useSettings();
  const { classifier } = useClassifier();

  useEffect(() => {
    const initController = async () => {
      if (!detector || !settings || !classifier) {
        setController(null);
        setStatus(LoadStatus.Failed);
        return;
      }
      try {
        const localController = SortProcessCtrl.getInstance(detector, classifier, settings);
        setController(localController);
        setStatus(LoadStatus.Loaded);
      } catch (error) {
        console.error('Failed to initialize sort controller:', error);
        setController(null);
        setStatus(LoadStatus.Failed);
      }
    };

    setStatus(LoadStatus.Loading);
    initController();
  }, [detector, settings, classifier]);

  return <SortControllerContext.Provider value={{ controller, status }}>{children}</SortControllerContext.Provider>;
};
