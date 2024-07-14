// contexts/ClassifierContext.tsx

'use client';

import React, { createContext, ReactNode, useEffect, useState, useCallback } from 'react';
import { LoadStatus } from '@/types/loadStatus.type';
import Classifier from '@/lib/classifier';
import useSocket from '@/hooks/useSocket';

interface ClassifierContextType {
  classifier: Classifier | null;
  status: LoadStatus;
  init: () => void;
}

export const ClassifierContext = createContext<ClassifierContextType>({
  classifier: null,
  status: LoadStatus.Loading,
  init: () => {},
});

export const ClassifierProvider = ({ children }: { children: ReactNode }) => {
  const [localClassifier, setLocalClassifier] = useState<Classifier | null>(null);
  const [status, setStatus] = useState<LoadStatus>(LoadStatus.Loading);
  const { socket, status: socketStatus } = useSocket();

  const init = useCallback(async () => {
    try {
      if (socketStatus === LoadStatus.Failed || !socket) {
        setStatus(LoadStatus.Failed);
        setLocalClassifier(null);
        console.log('Socket not connected. Cannot initialize Classifier.');
        return;
      }
      console.log('Initializing Classifier...');
      const classifier = Classifier.getInstance();
      await classifier.init(socket);
      setLocalClassifier(classifier);
      setStatus(LoadStatus.Loaded); // Set status to Loaded after successful initialization
      console.log('CLASSIFIER INITIALIZED');
    } catch (error) {
      console.error('Failed to initialize Classifier:', error);
      setStatus(LoadStatus.Failed); // Set status to Failed in case of an error
      setLocalClassifier(null);
    }
  }, [socket, socketStatus]);

  useEffect(() => {
    setStatus(LoadStatus.Loading); // Set status to Loading when the effect runs
    init();
  }, [init]); // Re-run the effect if socket or connection status changes

  return (
    <ClassifierContext.Provider value={{ classifier: localClassifier, status, init }}>
      {children}
    </ClassifierContext.Provider>
  );
};
