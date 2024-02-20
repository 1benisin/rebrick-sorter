// Import necessary hooks and Firebase functions
import { useState, useEffect } from 'react';
import SortProcessCtrl from '@/lib/sortProcessCtrl';
import useDetector from './useDetector';

const useSortController = () => {
  const [localController, setLocalController] = useState<SortProcessCtrl | null>(null);
  const detector = useDetector();

  useEffect(() => {
    const loadController = async () => {
      if (!detector) return;
      const controller = SortProcessCtrl.getInstance(detector);
      setLocalController(controller);
    };

    loadController();
  }, [detector]);

  return localController;
};

export default useSortController;
