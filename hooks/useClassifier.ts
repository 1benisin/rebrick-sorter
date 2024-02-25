'use client';
// Import necessary hooks and Firebase functions
import { useState, useEffect } from 'react';
import Classifier from '@/lib/classifier';
import { LoadStatus } from '@/types/loadStatus.type';
import { useSocket } from '@/components/providers/socketProvider';

const useClassifier = () => {
  const [localClassifier, setLocalClassifier] = useState<Classifier | null>(null);
  const [status, setStatus] = useState<LoadStatus>(LoadStatus.Loading);
  const { socket, isConnected: isSocketConnected } = useSocket();

  useEffect(() => {
    const initClassifer = async () => {
      if (!isSocketConnected || !socket) {
        return;
      }
      try {
        console.log('Initializing Classifier...');
        setStatus(LoadStatus.Loading);
        const classifier = Classifier.getInstance();
        await classifier.init(socket);
        setLocalClassifier(classifier);
        setStatus(LoadStatus.Loaded); // Set status to loaded after successful load
      } catch (error) {
        setStatus(LoadStatus.Failed); // Set status to failed on error
      }
    };

    initClassifer();
  }, [socket, isSocketConnected]);

  return { classifier: localClassifier, status };
};

export default useClassifier;
