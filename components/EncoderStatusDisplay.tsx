// components/EncoderStatusDisplay.tsx

import { useEffect, useState, useCallback } from 'react';
import { sortProcessStore } from '@/stores/sortProcessStore';
import serviceManager from '@/lib/services/ServiceManager';
import { ServiceName } from '@/lib/services/Service.interface';
import { BackToFrontEvents, EventPayloads } from '@/types/socketMessage.type';

/** Type for sorter state update payload from server */
type SorterStateUpdatePayload = EventPayloads[BackToFrontEvents.SORTER_STATE_UPDATE];

/** Maximum time in ms to extrapolate position beyond last update */
const MAX_INTERPOLATION_MS = 500;

/** Time in ms after which encoder data is considered stale */
const STALE_DATA_THRESHOLD_MS = 1000;

interface SorterState {
  currentBin: number;
  isMoving: boolean;
  targetBin: number | null;
  scheduledMoveCount: number;
}

const EncoderStatusDisplay = () => {
  // Encoder state from store
  const encoderPosition = sortProcessStore((state) => state.encoderPosition);
  const encoderTimestamp = sortProcessStore((state) => state.encoderTimestamp);
  const encoderVelocity = sortProcessStore((state) => state.encoderVelocity);

  // Buffer status from store
  const bufferCount = sortProcessStore((state) => state.bufferCount);
  const bufferCapacity = sortProcessStore((state) => state.bufferCapacity);

  // Local state for interpolated position and freshness
  const [interpolatedPosition, setInterpolatedPosition] = useState(0);
  const [isStale, setIsStale] = useState(true);

  // Sorter states from socket events
  const [sorterStates, setSorterStates] = useState<SorterState[]>([
    { currentBin: 1, isMoving: false, targetBin: null, scheduledMoveCount: 0 },
    { currentBin: 1, isMoving: false, targetBin: null, scheduledMoveCount: 0 },
    { currentBin: 1, isMoving: false, targetBin: null, scheduledMoveCount: 0 },
    { currentBin: 1, isMoving: false, targetBin: null, scheduledMoveCount: 0 },
  ]);

  const socket = serviceManager.getService(ServiceName.SOCKET);

  // Listen for SORTER_STATE_UPDATE events
  useEffect(() => {
    if (!socket) return;

    const handleSorterStateUpdate = (data: SorterStateUpdatePayload) => {
      // Bounds check for sorter index
      if (data.sorter < 0 || data.sorter >= 4) {
        console.warn(`[EncoderStatusDisplay] Invalid sorter index: ${data.sorter}`);
        return;
      }

      setSorterStates((prev) => {
        const newStates = [...prev];
        newStates[data.sorter] = {
          currentBin: data.currentBin,
          isMoving: data.isMoving,
          targetBin: data.targetBin,
          scheduledMoveCount: data.scheduledMoveCount,
        };
        return newStates;
      });
    };

    socket.on(BackToFrontEvents.SORTER_STATE_UPDATE, handleSorterStateUpdate);

    return () => {
      socket.off(BackToFrontEvents.SORTER_STATE_UPDATE, handleSorterStateUpdate);
    };
  }, [socket]);

  // Calculate interpolated position
  const getInterpolatedPosition = useCallback(() => {
    if (encoderTimestamp === 0) {
      return encoderPosition;
    }
    const elapsed = Date.now() - encoderTimestamp;
    // Cap interpolation to avoid runaway extrapolation
    const cappedElapsed = Math.min(elapsed, MAX_INTERPOLATION_MS);
    return Math.round(encoderPosition + cappedElapsed * encoderVelocity);
  }, [encoderPosition, encoderTimestamp, encoderVelocity]);

  // Update interpolated position and staleness at regular intervals
  useEffect(() => {
    const updateInterval = setInterval(() => {
      const elapsed = Date.now() - encoderTimestamp;
      const stale = encoderTimestamp === 0 || elapsed > STALE_DATA_THRESHOLD_MS;
      setIsStale(stale);

      // Only interpolate if data is fresh - avoid misleading values when stale
      if (!stale) {
        setInterpolatedPosition(getInterpolatedPosition());
      }
    }, 100); // Update 10 times per second

    return () => clearInterval(updateInterval);
  }, [getInterpolatedPosition, encoderTimestamp]);

  // Format velocity for display
  const formatVelocity = (velocity: number): string => {
    if (Math.abs(velocity) < 0.001) {
      return '0.00';
    }
    return velocity.toFixed(3);
  };

  // Format large numbers with commas
  const formatNumber = (num: number): string => {
    return num.toLocaleString();
  };

  return (
    <div className="space-y-3 rounded-lg bg-gray-100 p-4">
      {/* Encoder Status Section */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-600">ENCODER</span>
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${
              isStale ? 'bg-yellow-200 text-yellow-800' : 'bg-green-200 text-green-800'
            }`}
          >
            {isStale ? 'Stale' : 'Live'}
          </span>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between">
            <span className="text-sm text-gray-500">Position:</span>
            <span className="font-mono text-sm font-medium">{formatNumber(interpolatedPosition)} ticks</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-500">Velocity:</span>
            <span className="font-mono text-sm font-medium">{formatVelocity(encoderVelocity)} ct/ms</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-500">Pending Jets:</span>
            <span className="font-mono text-sm font-medium">
              {bufferCount} / {bufferCapacity}
            </span>
          </div>
        </div>
      </div>

      {/* Sorter States Section */}
      <div>
        <div className="mb-2 text-sm font-semibold text-gray-600">SORTERS</div>
        <div className="grid grid-cols-4 gap-2">
          {sorterStates.map((state, index) => (
            <div key={index} className={`rounded p-2 text-center ${state.isMoving ? 'bg-blue-100' : 'bg-white'}`}>
              <div className="text-xs font-bold text-gray-500">{String.fromCharCode(65 + index)}</div>
              <div className="text-lg font-semibold">{state.currentBin}</div>
              {state.isMoving && state.targetBin !== null && (
                <div className="text-xs text-blue-600">→ {state.targetBin}</div>
              )}
              {state.scheduledMoveCount > 0 && <div className="text-xs text-gray-400">+{state.scheduledMoveCount}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default EncoderStatusDisplay;
