// components/buttons/JetCalibrationPanel.tsx

'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { useSocket } from '@/components/hooks/useSocket';
import { AllEvents, BackToFrontEvents, EventPayloads } from '@/types/socketMessage.type';
import { sortProcessStore } from '@/stores/sortProcessStore';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Info } from 'lucide-react';

/** Maximum time in ms to extrapolate position beyond last update */
const MAX_INTERPOLATION_MS = 500;

/** Time to display confirmation message before auto-clearing */
const CONFIRMATION_DISPLAY_MS = 5000;

/** Sorter labels for display */
const SORTER_LABELS = ['A', 'B', 'C', 'D'];

/** Calibration state structure */
interface CalibrationState {
  isResetting: boolean; // Waiting for encoder reset confirmation
  isCalibrating: boolean;
  cameraWidthRecorded: boolean;
  cameraWidthTicks: number | null;
  calibratedJets: Map<number, number>; // sorter index → offset
}

const JetCalibrationPanel = () => {
  const { socket } = useSocket();
  const [isOpen, setIsOpen] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [calibrationState, setCalibrationState] = useState<CalibrationState>({
    isResetting: false,
    isCalibrating: false,
    cameraWidthRecorded: false,
    cameraWidthTicks: null,
    calibratedJets: new Map(),
  });

  // Refs to track timeouts for cleanup
  const confirmationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const errorTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Encoder state from store for live position display
  const encoderPosition = sortProcessStore((state) => state.encoderPosition);
  const encoderTimestamp = sortProcessStore((state) => state.encoderTimestamp);
  const encoderVelocity = sortProcessStore((state) => state.encoderVelocity);

  // Video capture dimensions from store (for auto-syncing camera width pixels)
  const videoCaptureDimensions = sortProcessStore((state) => state.videoCaptureDimensions);

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

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (confirmationTimeoutRef.current) {
        clearTimeout(confirmationTimeoutRef.current);
      }
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
    };
  }, []);

  // Helper to show error message with auto-dismiss
  const showError = useCallback((message: string) => {
    // Clear any existing error timeout
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
    }
    setErrorMessage(message);
    errorTimeoutRef.current = setTimeout(() => {
      setErrorMessage(null);
      errorTimeoutRef.current = null;
    }, CONFIRMATION_DISPLAY_MS);
  }, []);

  // Listen for calibration response events
  useEffect(() => {
    if (!socket) return;

    const handleEncoderResetComplete = (data: EventPayloads[BackToFrontEvents.ENCODER_RESET_COMPLETE]) => {
      if (data.success) {
        console.log('[JetCalibrationPanel] Encoder reset to', data.position);
        // Transition from resetting to calibrating state
        setCalibrationState((prev) => ({
          ...prev,
          isResetting: false,
          isCalibrating: true,
        }));
      } else {
        console.error('[JetCalibrationPanel] Encoder reset failed');
        showError('Failed to reset encoder. Please try again.');
        // Reset back to idle state on failure
        setCalibrationState((prev) => ({
          ...prev,
          isResetting: false,
          isCalibrating: false,
        }));
      }
    };

    const handleCalibrationPointRecorded = (data: EventPayloads[BackToFrontEvents.CALIBRATION_POINT_RECORDED]) => {
      if (data.success) {
        if (data.type === 'cameraWidth') {
          console.log('[JetCalibrationPanel] Camera width recorded:', data.position);
        } else if (data.type === 'jet') {
          console.log(`[JetCalibrationPanel] Jet ${SORTER_LABELS[data.sorter ?? 0]} recorded:`, data.position);
        }
      } else {
        console.error(`[JetCalibrationPanel] Failed to record ${data.type} position`);
        if (data.type === 'cameraWidth') {
          showError('Failed to record camera width. Please try again.');
        } else if (data.type === 'jet') {
          showError(`Failed to record Jet ${SORTER_LABELS[data.sorter ?? 0]} position. Please try again.`);
        } else {
          showError(`Failed to record ${data.type} position. Please try again.`);
        }
      }
    };

    socket.on(BackToFrontEvents.ENCODER_RESET_COMPLETE, handleEncoderResetComplete);
    socket.on(BackToFrontEvents.CALIBRATION_POINT_RECORDED, handleCalibrationPointRecorded);

    return () => {
      socket.off(BackToFrontEvents.ENCODER_RESET_COMPLETE, handleEncoderResetComplete);
      socket.off(BackToFrontEvents.CALIBRATION_POINT_RECORDED, handleCalibrationPointRecorded);
    };
  }, [socket, showError]);

  // Start calibration handler
  const handleStartCalibration = () => {
    if (!socket) return;

    // Reset encoder to 0 - this sets the left edge of camera as position 0
    socket.emit(AllEvents.RESET_ENCODER);

    // Set resetting state - wait for confirmation before enabling calibration
    setCalibrationState({
      isResetting: true,
      isCalibrating: false,
      cameraWidthRecorded: false,
      cameraWidthTicks: null,
      calibratedJets: new Map(),
    });

    // Clear any existing confirmation
    setShowConfirmation(false);
    if (confirmationTimeoutRef.current) {
      clearTimeout(confirmationTimeoutRef.current);
      confirmationTimeoutRef.current = null;
    }
  };

  // Stop calibration handler
  const handleStopCalibration = () => {
    setCalibrationState((prev) => ({
      ...prev,
      isResetting: false,
      isCalibrating: false,
    }));
    setShowConfirmation(true);

    // Auto-dismiss confirmation after 5 seconds
    confirmationTimeoutRef.current = setTimeout(() => {
      setShowConfirmation(false);
      confirmationTimeoutRef.current = null;
    }, CONFIRMATION_DISPLAY_MS);
  };

  // Mark camera width handler
  const handleMarkCameraWidth = () => {
    if (!socket) return;

    const widthInTicks = getInterpolatedPosition();

    // Include camera width pixels if available from video capture
    const cameraWidthPixels = videoCaptureDimensions.width > 0 ? videoCaptureDimensions.width : undefined;

    socket.emit(AllEvents.RECORD_CAMERA_WIDTH, { widthInTicks, cameraWidthPixels });

    setCalibrationState((prev) => ({
      ...prev,
      cameraWidthRecorded: true,
      cameraWidthTicks: widthInTicks,
    }));
  };

  // Mark jet position handler
  const handleMarkJet = (sorterIndex: number) => {
    if (!socket) return;

    const offsetFromLeftEdge = getInterpolatedPosition();

    socket.emit(AllEvents.RECORD_JET_POSITION, {
      sorter: sorterIndex,
      offsetFromLeftEdge,
    });

    setCalibrationState((prev) => {
      const newCalibrated = new Map(prev.calibratedJets);
      newCalibrated.set(sorterIndex, offsetFromLeftEdge);
      return { ...prev, calibratedJets: newCalibrated };
    });
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" className="w-full justify-between">
          <div className="flex items-center gap-2">
            <span>Jet Position Calibration</span>
            {/* Calibration status indicator */}
            {calibrationState.isResetting && (
              <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">Resetting...</span>
            )}
            {calibrationState.isCalibrating && !calibrationState.isResetting && (
              <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-xs text-yellow-700">In Progress</span>
            )}
            {showConfirmation && !calibrationState.isCalibrating && (
              <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">✓ Done</span>
            )}
            <HoverCard>
              <HoverCardTrigger asChild>
                <button className="text-gray-400 hover:text-gray-600" onClick={(e) => e.stopPropagation()}>
                  <Info size={16} />
                </button>
              </HoverCardTrigger>
              <HoverCardContent className="w-80 text-sm">
                <div className="space-y-2">
                  <p className="font-semibold">Calibration Steps:</p>
                  <ol className="list-inside list-decimal space-y-1 text-gray-600">
                    <li>Click &quot;Start Calibration&quot; (resets encoder to 0)</li>
                    <li>
                      Place a part aligned with the <strong>left edge</strong> of the camera view
                    </li>
                    <li>Use the motor driver forward button to move the conveyor</li>
                    <li>
                      When part reaches the <strong>right edge</strong> of camera, click &quot;Mark Camera Width&quot;
                    </li>
                    <li>Continue moving to each air jet and click the corresponding jet button</li>
                    <li>Click &quot;Stop Calibration&quot; when done</li>
                  </ol>
                  <p className="mt-2 text-xs text-gray-500">
                    This calibration enables accurate position tracking for parts detected anywhere in the camera frame.
                  </p>
                </div>
              </HoverCardContent>
            </HoverCard>
          </div>
          <span className="text-xs text-gray-500">{isOpen ? '▲' : '▼'}</span>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-3 rounded-lg bg-gray-50 p-3">
        {/* Live Position Display */}
        <div className="rounded bg-white p-3 text-center">
          <div className="text-sm text-gray-500">Current Encoder Position</div>
          <div className="font-mono text-xl font-bold">{interpolatedPosition.toLocaleString()}</div>
          {calibrationState.isCalibrating && (
            <div className="mt-1 text-xs text-gray-400">(Distance from camera left edge)</div>
          )}
        </div>

        {/* Error Message Display */}
        {errorMessage && (
          <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{errorMessage}</div>
        )}

        {/* Start/Stop Calibration Button */}
        <Button
          onClick={calibrationState.isCalibrating ? handleStopCalibration : handleStartCalibration}
          variant={calibrationState.isCalibrating ? 'destructive' : 'default'}
          className="w-full"
          disabled={!socket || calibrationState.isResetting}
        >
          {calibrationState.isResetting
            ? 'Resetting encoder...'
            : calibrationState.isCalibrating
              ? 'Stop Calibration'
              : 'Start Jet Calibration'}
        </Button>

        {/* Video dimensions warning */}
        {calibrationState.isCalibrating && videoCaptureDimensions.width === 0 && (
          <div className="rounded border border-orange-200 bg-orange-50 p-2 text-xs text-orange-700">
            Warning: Video capture not initialized - pixel width may be incorrect
          </div>
        )}

        {/* Mark Camera Width Button - can be re-marked during calibration */}
        <Button
          onClick={handleMarkCameraWidth}
          disabled={!calibrationState.isCalibrating}
          variant={calibrationState.cameraWidthRecorded ? 'default' : 'outline'}
          className={`w-full ${calibrationState.cameraWidthRecorded ? 'bg-green-600 hover:bg-green-700' : ''}`}
        >
          {calibrationState.cameraWidthRecorded ? (
            <span className="flex flex-col items-center">
              <span>✓ Camera Width</span>
              <span className="text-xs font-normal">
                {calibrationState.cameraWidthTicks?.toLocaleString()} ticks (click to re-mark)
              </span>
            </span>
          ) : (
            'Mark Camera Width (Right Edge)'
          )}
        </Button>

        {/* Jet Mark Buttons */}
        <div className="space-y-2">
          <span className="text-sm font-medium text-gray-600">Jet Positions:</span>
          <div className="grid grid-cols-2 gap-2">
            {SORTER_LABELS.map((label, index) => {
              const isMarked = calibrationState.calibratedJets.has(index);
              const offset = calibrationState.calibratedJets.get(index);
              const hasInvalidOffset =
                isMarked &&
                calibrationState.cameraWidthTicks !== null &&
                offset !== undefined &&
                offset <= calibrationState.cameraWidthTicks;

              return (
                <div key={index} className="flex flex-col">
                  <Button
                    onClick={() => handleMarkJet(index)}
                    disabled={!calibrationState.isCalibrating || !calibrationState.cameraWidthRecorded}
                    variant={isMarked ? 'default' : 'outline'}
                    className={
                      isMarked
                        ? hasInvalidOffset
                          ? 'bg-orange-500 hover:bg-orange-600'
                          : 'bg-green-600 hover:bg-green-700'
                        : ''
                    }
                  >
                    <span className="flex flex-col items-center">
                      <span>
                        {isMarked ? '✓ ' : ''}Jet {label}
                      </span>
                      {isMarked && <span className="text-xs font-normal">{offset?.toLocaleString()} ticks</span>}
                    </span>
                  </Button>
                  {hasInvalidOffset && (
                    <span className="mt-1 text-xs text-orange-600">Warning: Should be past camera</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Calibration Complete Confirmation */}
        {showConfirmation && !calibrationState.isCalibrating && (
          <div className="rounded border border-green-200 bg-green-50 p-3 text-sm">
            <div className="font-semibold text-green-800">✓ Calibration Complete</div>
            <div className="mt-1 text-green-700">
              {calibrationState.cameraWidthTicks !== null && (
                <div>Camera width: {calibrationState.cameraWidthTicks.toLocaleString()} ticks</div>
              )}
              {Array.from(calibrationState.calibratedJets.entries()).map(([jet, offset]) => (
                <div key={jet}>
                  Jet {SORTER_LABELS[jet]}: {offset.toLocaleString()} ticks
                </div>
              ))}
            </div>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
};

export default JetCalibrationPanel;
