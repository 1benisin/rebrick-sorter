import { useContext } from 'react';
import { SortControllerContext } from '@/contexts/SortControllerContext';

const useSortController = () => {
  const context = useContext(SortControllerContext);
  if (context === undefined) {
    throw new Error('useSortController must be used within a SortControllerProvider');
  }
  return context;
};

export default useSortController;

// 'use client';
// // Import necessary hooks and Firebase functions
// import { useState, useEffect } from 'react';
// import SortProcessCtrl from '@/lib/sortProcessCtrl';
// import useDetector from './useDetector';
// import useSettings from './useSettings';
// import useClassifier from './useClassifier';

// const useSortController = () => {
//   const [localController, setLocalController] = useState<SortProcessCtrl | null>(null);
//   const { detector } = useDetector();
//   const { settings } = useSettings();
//   const { classifier } = useClassifier();

//   useEffect(() => {
//     const loadController = async () => {
//       setLocalController(null);
//       if (!detector || !settings || !classifier) return;
//       const controller = SortProcessCtrl.getInstance(detector, classifier, settings);
//       setLocalController(controller);
//     };

//     loadController();
//   }, [detector, settings, classifier]);

//   return localController;
// };

// export default useSortController;
