'use client';
// Import necessary hooks and Firebase functions
import { useState, useEffect } from 'react';
import SortProcessCtrl from '@/lib/sortProcessCtrl';
import useDetector from './useDetector';
import useSettings from './useSettings';

const useSortController = () => {
  const [localController, setLocalController] = useState<SortProcessCtrl | null>(null);
  const { detector } = useDetector();
  const { settings } = useSettings();

  useEffect(() => {
    const loadController = async () => {
      if (!detector || !settings) return;
      const controller = SortProcessCtrl.getInstance(detector, settings);
      setLocalController(controller);
    };

    loadController();
  }, [detector, settings]);

  return localController;
};

export default useSortController;
