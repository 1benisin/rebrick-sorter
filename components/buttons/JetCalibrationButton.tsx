'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useSocket } from '@/components/hooks/useSocket';
import { AllEvents } from '@/types/socketMessage.type';
import serviceManager from '@/lib/services/ServiceManager';
import { ServiceName } from '@/lib/services/Service.interface';

interface JetCalibrationButtonProps {
  jetNumber: number;
}

interface DetectionData {
  x: number;
  timestamp: number;
}

const JetCalibrationButton = ({ jetNumber }: JetCalibrationButtonProps) => {
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [isWaitingForFire, setIsWaitingForFire] = useState(false);
  const [calibrationResult, setCalibrationResult] = useState<number | null>(null);
  const [initialTime, setInitialTime] = useState<number | null>(null);
  const { socket } = useSocket();

  const handleCalibrate = async () => {
    if (!socket) return;

    setIsCalibrating(true);
    setIsWaitingForFire(true);
    setInitialTime(Date.now());

    // Get the detector service to track part position
    const detector = serviceManager.getService(ServiceName.DETECTOR);
    const detections: DetectionData[] = [];
    let firstDetectionTime: number | null = null;

    const detectPart = async () => {
      const detectionPairs = await detector.detect();
      if (detectionPairs.length > 0) {
        // Get the detection with the centroid furthest to the right
        const nextDetection = detectionPairs.reduce((acc, pair) => {
          const detection = pair[0];
          return acc.centroid.x < detection.centroid.x ? acc : detection;
        }, detectionPairs[0][0]);

        const currentTime = Date.now();

        // Record first detection time
        if (firstDetectionTime === null) {
          firstDetectionTime = currentTime;
        }

        // Add detection to array
        detections.push({
          x: nextDetection.centroid.x,
          timestamp: currentTime,
        });

        // Stop after 3 seconds from first detection
        if (firstDetectionTime && currentTime - firstDetectionTime >= 3000) {
          // Use the middle detection
          if (detections.length > 0) {
            const middleIndex = Math.floor(detections.length / 2);
            const middleDetection = detections[middleIndex];

            // Use middle detection's time and position
            setInitialTime(middleDetection.timestamp);
            setCalibrationResult(Math.round(middleDetection.x));
          }
          return; // Stop recursive calls
        }
      }

      // Schedule next detection
      setTimeout(detectPart, 100);
    };

    // Start the recursive detection
    detectPart();
  };

  const handleFireJet = () => {
    if (!socket || !initialTime) return;

    // Fire the jet
    socket.emit(AllEvents.FIRE_JET, { sorter: jetNumber });

    // Calculate the distance based on time and default speed
    const settingsService = serviceManager.getService(ServiceName.SETTINGS);
    const { conveyorSpeed } = settingsService.getSettings();
    const timeElapsed = Date.now() - initialTime;
    const distance = Math.round(timeElapsed * conveyorSpeed);

    setCalibrationResult(distance);
    setIsWaitingForFire(false);
    setIsCalibrating(false);
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <Button
        type="button"
        className="bg-blue-500 hover:bg-blue-700"
        variant={isCalibrating ? 'outline' : 'default'}
        onClick={isWaitingForFire ? handleFireJet : handleCalibrate}
        disabled={isCalibrating && !isWaitingForFire}
      >
        {isWaitingForFire ? `Fire Jet ${jetNumber}` : isCalibrating ? 'Calibrating...' : `Calibrate Jet ${jetNumber}`}
      </Button>
      {calibrationResult && <span className="text-sm">{calibrationResult}</span>}
    </div>
  );
};

export default JetCalibrationButton;
