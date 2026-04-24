// components/buttons/TravelTimeCalibrationButton.tsx

'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useSocket } from '@/components/hooks/useSocket';
import { useSettings } from '@/components/hooks/useSettings';
import { useToast } from '@/components/hooks/use-toast';
import { AllEvents, BackToFrontEvents, EventPayloads } from '@/types/socketMessage.type';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Info } from 'lucide-react';
import { getSorterLetter } from '@/lib/utils';
import HomeAllSortersButton from '@/components/buttons/HomeAllSortersButton';

/** Format a date string for display */
const formatCalibrationDate = (isoString: string): string => {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return `today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  } else if (diffDays === 1) {
    return 'yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return date.toLocaleDateString();
  }
};

const TravelTimeCalibrationButton = () => {
  const { socket } = useSocket();
  const { settings } = useSettings();
  const { toast } = useToast();
  const [isCalibrating, setIsCalibrating] = useState(false);

  // Get the most recent calibration timestamp from settings
  const getLastCalibrationDate = (): string | null => {
    if (!settings?.travelTimeCalibration?.length) return null;

    const timestamps = settings.travelTimeCalibration
      .filter((cal): cal is NonNullable<typeof cal> => cal !== null && !!cal.calibratedAt)
      .map((cal) => cal.calibratedAt!)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

    return timestamps[0] || null;
  };

  const lastCalibrationDate = getLastCalibrationDate();

  // Listen for calibration status events
  useEffect(() => {
    if (!socket) return;

    const handleCalibrationStatus = (data: EventPayloads[BackToFrontEvents.TRAVEL_TIME_CALIBRATION_STATUS]) => {
      switch (data.status) {
        case 'started':
          setIsCalibrating(true);
          break;

        case 'complete':
          setIsCalibrating(false);
          toast({
            title: 'Calibration complete',
            description: 'Travel times calibrated for all sorters.',
          });
          break;

        case 'partial_failure': {
          setIsCalibrating(false);
          const results = data.results ?? [];
          const failedSorters = results.filter((r) => !r.success).map((r) => getSorterLetter(r.sorter));
          const successSorters = results.filter((r) => r.success).map((r) => getSorterLetter(r.sorter));

          toast({
            title: 'Calibration partially complete',
            description: `Sorters ${failedSorters.join(', ')} failed. ${successSorters.length ? `Sorters ${successSorters.join(', ')} calibrated successfully.` : ''}`,
          });
          break;
        }

        case 'error':
          setIsCalibrating(false);
          toast({
            title: 'Calibration failed',
            description: data.error || 'An unknown error occurred.',
            variant: 'destructive',
          });
          break;
      }
    };

    socket.on(BackToFrontEvents.TRAVEL_TIME_CALIBRATION_STATUS, handleCalibrationStatus);

    return () => {
      socket.off(BackToFrontEvents.TRAVEL_TIME_CALIBRATION_STATUS, handleCalibrationStatus);
    };
  }, [socket, toast]);

  const handleStartCalibration = () => {
    if (!socket) return;
    socket.emit(AllEvents.START_TRAVEL_TIME_CALIBRATION);
    // The 'started' status from the server will set isCalibrating to true
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <HomeAllSortersButton />
        <Button onClick={handleStartCalibration} disabled={!socket || isCalibrating} className="min-w-[180px] flex-1">
          {isCalibrating ? 'Calibrating...' : 'Calibrate Travel Times'}
        </Button>

        <HoverCard>
          <HoverCardTrigger asChild>
            <button className="text-gray-400 hover:text-gray-600" type="button">
              <Info size={20} />
            </button>
          </HoverCardTrigger>
          <HoverCardContent className="w-80 text-sm">
            <div className="space-y-2">
              <p className="font-semibold">Travel Time Calibration</p>
              <p className="text-gray-600">
                This calibration measures how long each sorter takes to move between bins. The results are used to
                determine if a sorter can reach a target bin in time for an incoming part.
              </p>
              <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700">
                <strong>Requirements:</strong>
                <ul className="mt-1 list-inside list-disc">
                  <li>All sorters must be homed (at bin 1)</li>
                  <li>Stop sorting before calibrating</li>
                </ul>
              </div>
              <p className="text-xs text-gray-500">
                Calibration takes approximately 30-60 seconds. All 4 sorters are calibrated simultaneously.
              </p>
            </div>
          </HoverCardContent>
        </HoverCard>
      </div>

      {/* Last calibration timestamp */}
      {lastCalibrationDate && (
        <div className="text-xs text-gray-500">Last calibrated: {formatCalibrationDate(lastCalibrationDate)}</div>
      )}

      {/* Calibration status indicator */}
      {isCalibrating && (
        <div className="rounded border border-blue-200 bg-blue-50 p-2 text-sm text-blue-700">
          Calibrating all sorters... This may take up to 60 seconds.
        </div>
      )}
    </div>
  );
};

export default TravelTimeCalibrationButton;
