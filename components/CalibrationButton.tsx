// sorterControllerButton.jsx
'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import Detector from '@/lib/dualDetector';

const CalibrationButton = () => {
  const [localDetector, setLocalDetector] = useState<Detector | null>(null);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationResult, setCalibrationResult] = useState(0);

  useEffect(() => {
    const detector = Detector.getInstance();
    setLocalDetector(detector);
  }, []);

  const handleCalibrate = async () => {
    if (!localDetector) {
      return;
    }
    setIsCalibrating(true);
    await localDetector.calibrateConveyorSpeed().then((result) => {
      setIsCalibrating(false);
      setCalibrationResult(result);
    });
  };

  return (
    <>
      <Button
        className="ml-4 bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
        variant={isCalibrating ? 'outline' : 'default'}
        onClick={handleCalibrate}
        disabled={isCalibrating}
      >
        {isCalibrating ? 'Calibrating...' : 'Calibrate'}
      </Button>
      {calibrationResult && <span> {calibrationResult}</span>}
    </>
  );
};

export default CalibrationButton;
