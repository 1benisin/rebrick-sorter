// components/buttons/EncoderDiagnosticsButton.tsx

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

/** Result state with success/error status */
interface ResultState {
  message: string;
  isError: boolean;
}

/**
 * EncoderDiagnosticsButton provides encoder diagnostics and reset functionality.
 * For calibrating jet positions, use JetCalibrationPanel instead.
 */
const EncoderDiagnosticsButton = () => {
  const { socket } = useSocket();
  const { settings } = useSettings();
  const [isOpen, setIsOpen] = useState(false);
  const [lastResult, setLastResult] = useState<ResultState | null>(null);
  const [isResetting, setIsResetting] = useState(false);

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
    setIsResetting(false);

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

  // Listen for encoder reset response
  useEffect(() => {
    if (!socket) return;

    const handleEncoderResetComplete = (data: EventPayloads[BackToFrontEvents.ENCODER_RESET_COMPLETE]) => {
      if (data.success) {
        setResultWithTimeout(`Encoder reset to ${data.position}`, false);
      } else {
        setResultWithTimeout('Encoder reset failed', true);
      }
    };

    socket.on(BackToFrontEvents.ENCODER_RESET_COMPLETE, handleEncoderResetComplete);

    return () => {
      socket.off(BackToFrontEvents.ENCODER_RESET_COMPLETE, handleEncoderResetComplete);
    };
  }, [socket, setResultWithTimeout]);

  const handleResetEncoder = () => {
    if (!socket || isResetting) return;
    setIsResetting(true);
    socket.emit(AllEvents.RESET_ENCODER);
  };

  // Get current calibration values from settings
  const positionCalibration = settings?.positionCalibration;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" className="w-full justify-between">
          Encoder Diagnostics
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
        <Button onClick={handleResetEncoder} variant="destructive" className="w-full" disabled={!socket || isResetting}>
          {isResetting ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Resetting...
            </span>
          ) : (
            'Reset Encoder to 0'
          )}
        </Button>

        {/* Calibration Values Display (Read-only) */}
        <div className="space-y-2 border-t pt-2">
          <span className="text-xs font-medium text-gray-500">Current Calibration Values:</span>

          {/* Camera calibration */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-500">Camera Width:</span>
              <span className="font-mono">{positionCalibration?.cameraWidthInTicks ?? 0} ticks</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Camera Pixels:</span>
              <span className="font-mono">{positionCalibration?.cameraWidthPixels ?? 1280}</span>
            </div>
          </div>

          {/* Jet offsets */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            {SORTER_LABELS.map((label, index) => (
              <div key={index} className="flex justify-between">
                <span className="text-gray-500">Jet {label}:</span>
                <span className="font-mono">{positionCalibration?.jetEncoderOffsets?.[index] ?? 0}</span>
              </div>
            ))}
          </div>

          {/* Other calibration values */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
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

export default EncoderDiagnosticsButton;
