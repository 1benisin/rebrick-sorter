// Import necessary hooks and Firebase functions
import { useState, useEffect } from 'react';
import DualVideoCapture from '@/lib/dualVideoCapture';
import { sortProcessStore } from '@/stores/sortProcessStore';

const useVideoCapture = () => {
  const [localVideoCapture, setLocalVideoCapture] = useState<DualVideoCapture | null>(null);
  const videoStreamId = sortProcessStore.getState().videoStreamId;

  useEffect(() => {
    const load = async () => {
      const videoCapture = DualVideoCapture.getInstance();
      await videoCapture.init(videoStreamId);
      setLocalVideoCapture(videoCapture);
    };

    load();
  }, [videoStreamId]);

  return localVideoCapture;
};

export default useVideoCapture;
