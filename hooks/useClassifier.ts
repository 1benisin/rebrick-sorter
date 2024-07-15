// hooks/useClassifier.ts

import { useContext } from 'react';
import { ClassifierContext } from '@/contexts/ClassifierContext';

const useClassifier = () => {
  const context = useContext(ClassifierContext);
  if (context === undefined) {
    throw new Error('useClassifier must be used within a ClassifierProvider');
  }
  return context;
};

export default useClassifier;

// 'use client';
// // Import necessary hooks and Firebase functions
// import { useState, useEffect } from 'react';
// import Classifier from '@/lib/classifier';
// import { LoadStatus } from '@/types/loadStatus.type';
// import { useSocket } from '@/contexts/SocketContext';

// const useClassifier = () => {
//   const [localClassifier, setLocalClassifier] = useState<Classifier | null>(null);
//   const [status, setStatus] = useState<LoadStatus>(LoadStatus.Loading);
//   const { socket, isConnected: isSocketConnected } = useSocket();

//   useEffect(() => {
//     const initClassifer = async () => {
//       try {
//         console.log('Initializing Classifier...');
//         setStatus(LoadStatus.Loading);
//         if (!isSocketConnected || !socket) {
//           setStatus(LoadStatus.Failed);
//           return;
//         }
//         const classifier = Classifier.getInstance();
//         await classifier.init(socket);
//         setLocalClassifier(classifier);
//         setStatus(LoadStatus.Loaded); // Set status to loaded after successful load
//         console.log('Classifier initialized');
//       } catch (error) {
//         setStatus(LoadStatus.Failed); // Set status to failed on error
//       }
//     };

//     initClassifer();
//   }, [socket, isSocketConnected]);

//   return { classifier: localClassifier, status };
// };

// export default useClassifier;
