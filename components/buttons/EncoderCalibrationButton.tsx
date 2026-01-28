// components/buttons/EncoderCalibrationButton.tsx

'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { useSocket } from '@/components/hooks/useSocket';
import { useSettings } from '@/components/hooks/useSettings';
import { AllEvents, BackToFrontEvents, EventPayloads } from '@/types/socketMessage.type';
import { sortProcessStore } from '@/stores/sortProcessStore';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

/** Maximum time in ms to extrapolate position beyond last update */
const MAX_INTERPOLATION_MS = 500;

/** Time to display result message before auto-clearing */
const RESULT_DISPLAY_MS = 3000;

/** Sorter labels for display */
const SORTER_LABELS = ['A', 'B', 'C', 'D'];

/** Loading state type for tracking which operation is in progress */
type LoadingState = 'reset' | 'camera' | `jet-${number}` | null;

/** Result state with success/error status */
interface ResultState {
  message: string;
  isError: boolean;
}

const EncoderCalibrationButton = () => {
  const { socket } = useSocket();
  const { settings } = useSettings();
  const [isOpen, setIsOpen] = useState(false);
  const [lastResult, setLastResult] = useState<ResultState | null>(null);
  const [loadingState, setLoadingState] = useState<LoadingState>(null);

  // Ref to track timeout for cleanup
  const resultTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Encoder state from store for live position display
  const encoderPosition = sortProcessStore((state) => state.encoderPosition);
  const encoderTimestamp = sortProcessStore((state) => state.encoderTimestamp);
  const encoderVelocity = sortProcessStore((state) => state.encoderVelocity);

  // Calculate interpolated position for display
  const getInterpolatedPosition = useCallback(() => {
    if (encoderTimestamp === 0) {
      return encoderPosition;
    }
    const elapsed = Date.now() - encoderTimestamp;
    const cappedElapsed = Math.min(elapsed, MAX_INTERPOLATION_MS);
    return Math.round(encoderPosition + cappedElapsed * encoderVelocity);
  }, [encoderPosition, encoderTimestamp, encoderVelocity]);

  const [interpolatedPosition, setInterpolatedPosition] = useState(0);

  // Update interpolated position at regular intervals
  useEffect(() => {
    if (!isOpen) return;

    const updateInterval = setInterval(() => {
      setInterpolatedPosition(getInterpolatedPosition());
    }, 100);

    return () => clearInterval(updateInterval);
  }, [getInterpolatedPosition, isOpen]);

  // Helper to set result with auto-clear and proper cleanup
  const setResultWithTimeout = useCallback((message: string, isError: boolean) => {
    // Clear any existing timeout
    if (resultTimeoutRef.current) {
      clearTimeout(resultTimeoutRef.current);
    }

    setLastResult({ message, isError });
    setLoadingState(null);

    // Set new timeout to clear result
    resultTimeoutRef.current = setTimeout(() => {
      setLastResult(null);
      resultTimeoutRef.current = null;
    }, RESULT_DISPLAY_MS);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (resultTimeoutRef.current) {
        clearTimeout(resultTimeoutRef.current);
      }
    };
  }, []);

  // Listen for calibration response events
  useEffect(() => {
    if (!socket) return;

    const handleEncoderResetComplete = (data: EventPayloads[BackToFrontEvents.ENCODER_RESET_COMPLETE]) => {
      if (data.success) {
        setResultWithTimeout(`Encoder reset to ${data.position}`, false);
      } else {
        setResultWithTimeout('Encoder reset failed', true);
      }
    };

    const handleCalibrationPointRecorded = (data: EventPayloads[BackToFrontEvents.CALIBRATION_POINT_RECORDED]) => {
      if (data.success) {
        if (data.type === 'camera') {
          setResultWithTimeout(`Camera position recorded: ${data.position}`, false);
        } else {
          setResultWithTimeout(`Jet ${SORTER_LABELS[data.sorter ?? 0]} position recorded: ${data.position}`, false);
        }
      } else {
        setResultWithTimeout(`Failed to record ${data.type} position`, true);
      }
    };

    socket.on(BackToFrontEvents.ENCODER_RESET_COMPLETE, handleEncoderResetComplete);
    socket.on(BackToFrontEvents.CALIBRATION_POINT_RECORDED, handleCalibrationPointRecorded);

    return () => {
      socket.off(BackToFrontEvents.ENCODER_RESET_COMPLETE, handleEncoderResetComplete);
      socket.off(BackToFrontEvents.CALIBRATION_POINT_RECORDED, handleCalibrationPointRecorded);
    };
  }, [socket, setResultWithTimeout]);

  const handleResetEncoder = () => {
    if (!socket || loadingState) return;
    setLoadingState('reset');
    socket.emit(AllEvents.RESET_ENCODER);
  };

  const handleRecordCameraPosition = () => {
    if (!socket || loadingState) return;
    setLoadingState('camera');
    socket.emit(AllEvents.RECORD_CAMERA_POSITION);
  };

  const handleRecordJetPosition = (sorter: number) => {
    if (!socket || loadingState) return;
    setLoadingState(`jet-${sorter}`);
    socket.emit(AllEvents.RECORD_JET_POSITION, { sorter });
  };

  // Get current calibration values from settings
  const positionCalibration = settings?.positionCalibration;

  // Helper to check if a specific button is loading
  const isButtonLoading = (state: LoadingState) => loadingState === state;
  const isAnyLoading = loadingState !== null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" className="w-full justify-between">
          Encoder Calibration
          <span className="text-xs text-gray-500">{isOpen ? '▲' : '▼'}</span>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-3 rounded-lg bg-gray-50 p-3">
        {/* Live Position Display */}
        <div className="flex items-center justify-between rounded bg-white p-2">
          <span className="text-sm font-medium text-gray-600">Current Position:</span>
          <span className="font-mono text-lg font-bold">{interpolatedPosition.toLocaleString()}</span>
        </div>

        {/* Result Message - conditional styling based on success/error */}
        {lastResult && (
          <div
            className={`rounded p-2 text-center text-sm ${
              lastResult.isError ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
            }`}
          >
            {lastResult.message}
          </div>
        )}

        {/* Reset Encoder Button */}
        <Button
          onClick={handleResetEncoder}
          variant="destructive"
          className="w-full"
          disabled={!socket || isAnyLoading}
        >
          {isButtonLoading('reset') ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Resetting...
            </span>
          ) : (
            'Reset Encoder to 0'
          )}
        </Button>

        {/* Camera Position Calibration */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Camera Offset:</span>
            <span className="font-mono text-xs">{positionCalibration?.cameraEncoderOffset ?? 0}</span>
          </div>
          <Button
            onClick={handleRecordCameraPosition}
            className="w-full bg-blue-500 hover:bg-blue-600"
            disabled={!socket || isAnyLoading}
          >
            {isButtonLoading('camera') ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Recording...
              </span>
            ) : (
              'Mark Camera Position'
            )}
          </Button>
        </div>

        {/* Jet Position Calibration */}
        <div className="space-y-2">
          <span className="text-sm font-medium text-gray-600">Jet Positions:</span>
          <div className="grid grid-cols-2 gap-2">
            {SORTER_LABELS.map((label, index) => (
              <div key={index} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Jet {label}:</span>
                  <span className="font-mono">{positionCalibration?.jetEncoderOffsets?.[index] ?? 0}</span>
                </div>
                <Button
                  onClick={() => handleRecordJetPosition(index)}
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={!socket || isAnyLoading}
                >
                  {isButtonLoading(`jet-${index}`) ? (
                    <span className="flex items-center gap-2">
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-gray-600 border-t-transparent" />
                      ...
                    </span>
                  ) : (
                    `Mark Jet ${label}`
                  )}
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Additional Calibration Values Display */}
        <div className="space-y-1 border-t pt-2">
          <span className="text-xs font-medium text-gray-500">Other Calibration Values:</span>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-500">Counts/Pixel:</span>
              <span className="font-mono">{positionCalibration?.countsPerPixel ?? 1}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Fall Time:</span>
              <span className="font-mono">{positionCalibration?.fallTimeInCounts ?? 24}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Jet Lead:</span>
              <span className="font-mono">{positionCalibration?.jetLeadCounts ?? 100}</span>
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export default EncoderCalibrationButton;
