// Import necessary hooks and Firebase functions
import { useState, useEffect } from 'react';
import Detector from '@/lib/dualDetector';
import useVideoCapture from './useVideoCapture';

const useDetector = () => {
  const [localDetector, setLocalDetector] = useState<Detector | null>(null);
  const videoCapture = useVideoCapture();

  useEffect(() => {
    const loadDetector = async () => {
      if (!videoCapture) return;
      const detector = Detector.getInstance();
      await detector.init(videoCapture);
      setLocalDetector(detector);
    };

    loadDetector();
  }, [videoCapture]);

  return localDetector;
};

export default useDetector;
