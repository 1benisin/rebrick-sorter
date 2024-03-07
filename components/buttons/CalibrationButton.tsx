// sorterControllerButton.jsx
'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import useDetector from '@/hooks/useDetector';

const CalibrationButton = () => {
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationResult, setCalibrationResult] = useState<number | null>(null);
  const { detector } = useDetector();

  const handleCalibrate = async () => {
    if (!detector) {
      return;
    }
    setIsCalibrating(true);
    await detector.calibrateConveyorSpeed().then((result) => {
      setIsCalibrating(false);
      setCalibrationResult(result);
    });
  };

  return (
    <div className="flex items-center">
      <Button
        className="bg-green-500 hover:bg-green-700"
        variant={isCalibrating ? 'outline' : 'default'}
        onClick={handleCalibrate}
        disabled={isCalibrating}
      >
        {isCalibrating ? 'Calibrating...' : 'Calibrate'}
      </Button>
      {calibrationResult && <span> {calibrationResult}</span>}
    </div>
  );
};

export default CalibrationButton;
