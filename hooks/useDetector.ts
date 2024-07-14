// hooks/useDetector.ts

import { useContext } from 'react';
import { DetectorContext } from '@/contexts/DetectorContext';

const useDetector = () => {
  const context = useContext(DetectorContext);
  if (context === undefined) {
    throw new Error('useDetector must be used within a DetectorProvider');
  }
  return context;
};

export default useDetector;

// 'use client';
// // Import necessary hooks and Firebase functions
// import { useState, useEffect } from 'react';
// import Detector from '@/lib/dualDetector';
// import useVideoCapture from './useVideoCapture';
// import { LoadStatus } from '@/types/loadStatus.type';

// const useDetector = () => {
//   const [localDetector, setLocalDetector] = useState<Detector | null>(null);
//   const [status, setStatus] = useState<LoadStatus>(LoadStatus.Loading);

//   const videoCapture = useVideoCapture();

//   useEffect(() => {
//     const loadDetector = async () => {
//       setStatus(LoadStatus.Loading); // Set status to loading at the start
//       if (!videoCapture) {
//         setStatus(LoadStatus.Failed);
//         return;
//       }
//       try {
//         const detector = Detector.getInstance();
//         await detector.init(videoCapture);
//         setLocalDetector(detector);
//         setStatus(LoadStatus.Loaded); // Set status to loaded after successful load
//       } catch (error) {
//         setStatus(LoadStatus.Failed); // Set status to failed on error
//       }
//     };

//     loadDetector();
//   }, [videoCapture]);

//   const reInit = async () => {
//     console.log('Reinitializing detector');
//     setStatus(LoadStatus.Loading); // Set status to loading at the start
//     if (!videoCapture) {
//       setStatus(LoadStatus.Failed);
//       return;
//     }
//     try {
//       const detector = Detector.getInstance();
//       await detector.reInit(videoCapture);
//       setLocalDetector(detector);
//       setStatus(LoadStatus.Loaded); // Set status to loaded after successful load
//       console.log('Detector reinitialized');
//     } catch (error) {
//       setStatus(LoadStatus.Failed); // Set status to failed on error
//     }
//   };

//   return { detector: localDetector, status, reInit };
// };

// export default useDetector;
