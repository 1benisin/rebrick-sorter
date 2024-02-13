// sorterControllerButton.jsx
'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

const CalibrationButton = () => {
  // const [localDetector, setLocalDetector] = useState<Detector | null>(null);
  // const [isCalibrating, setIsCalibrating] = useState(false);

  // useEffect(() => {
  //   const detector = Detector.getInstance();
  //   setLocalDetector(detector);
  // }, []);

  // const handleCalibrate = () => {
  //   if (!localDetector) {
  //     return;
  //   }
  //   setIsCalibrating(true);
  //   localDetector.calibrateConveyorSpeed().then((result) => {
  //     setIsCalibrating(false);
  //   });
  // };

  return (
    <div></div>
    // <Button
    //   className="ml-4 bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
    //   variant={isCalibrating ? 'outline' : 'default'}
    //   onClick={handleCalibrate}
    //   disabled={isCalibrating}
    // >
    //   {isCalibrating ? 'Calibrating...' : 'Calibrate'}
    // </Button>
  );
};

export default CalibrationButton;
