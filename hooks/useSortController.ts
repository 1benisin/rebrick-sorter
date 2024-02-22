'use client';
// Import necessary hooks and Firebase functions
import { useState, useEffect } from 'react';
import SortProcessCtrl from '@/lib/sortProcessCtrl';
import useDetector from './useDetector';
import useSettings from './useSettings';
import useClassifier from './useClassifier';

const useSortController = () => {
  const [localController, setLocalController] = useState<SortProcessCtrl | null>(null);
  const { detector } = useDetector();
  const { settings } = useSettings();
  const { classifier } = useClassifier();

  useEffect(() => {
    const loadController = async () => {
      if (!detector || !settings || !classifier) return;
      const controller = SortProcessCtrl.getInstance(detector, classifier, settings);
      setLocalController(controller);
    };

    loadController();
  }, [detector, settings, classifier]);

  return localController;
};

export default useSortController;
