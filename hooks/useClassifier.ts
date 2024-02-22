'use client';
// Import necessary hooks and Firebase functions
import { useState, useEffect } from 'react';
import Classifier from '@/lib/classifier';
import { LoadStatus } from '@/types/loadStatus.type';

const useClassifier = () => {
  const [localClassifier, setLocalClassifier] = useState<Classifier | null>(null);
  const [status, setStatus] = useState<LoadStatus>(LoadStatus.Loading);

  useEffect(() => {
    const initClassifer = async () => {
      try {
        setStatus(LoadStatus.Loading);
        const classifier = Classifier.getInstance();
        await classifier.init();
        setLocalClassifier(classifier);
        setStatus(LoadStatus.Loaded); // Set status to loaded after successful load
      } catch (error) {
        setStatus(LoadStatus.Failed); // Set status to failed on error
      }
    };

    initClassifer();
  }, []);

  return { classifier: localClassifier, status };
};

export default useClassifier;
