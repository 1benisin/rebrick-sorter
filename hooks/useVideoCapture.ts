import { useContext } from 'react';
import { VideoCaptureContext } from '@/contexts/VideoCaptureContext';

const useVideoCapture = () => {
  const context = useContext(VideoCaptureContext);
  if (context === undefined) {
    throw new Error('useVideoCapture must be used within a VideoCaptureProvider');
  }
  return context;
};

export default useVideoCapture;

// 'use client';
// // Import necessary hooks and Firebase functions
// import { useState, useEffect } from 'react';
// import DualVideoCapture from '@/lib/dualVideoCapture';
// import { sortProcessStore } from '@/stores/sortProcessStore';
// import { set } from 'zod';

// const useVideoCapture = () => {
//   const [localVideoCapture, setLocalVideoCapture] = useState<DualVideoCapture | null>(null);
//   const videoStreamId = sortProcessStore.getState().videoStreamId;

//   useEffect(() => {
//     const load = async () => {
//       if (!videoStreamId) {
//         console.log('No video stream id');
//       }
//       const videoCapture = DualVideoCapture.getInstance();
//       await videoCapture.init(videoStreamId);
//       setLocalVideoCapture(videoCapture);
//     };

//     load();
//   }, [videoStreamId]);

//   return localVideoCapture;
// };

// export default useVideoCapture;
