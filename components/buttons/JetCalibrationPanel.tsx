// components/buttons/JetCalibrationPanel.tsx

'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { useSocket } from '@/components/hooks/useSocket';
import { useSettings } from '@/components/hooks/useSettings';
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
  cameraWidthRecorded: boolean; // true = explicitly marked this session
  cameraWidthTicks: number | null;
  cameraWidthPixels?: number; // Camera resolution width in pixels
  calibratedJets: Map<number, number>; // sorter index → offset (only jets marked THIS session)
  // Original values loaded at calibration start (for partial updates)
  originalCameraWidthTicks: number | null;
  originalCameraWidthPixels: number | null;
  originalJetOffsets: [number, number, number, number] | null;
}

const JetCalibrationPanel = () => {
  const { socket } = useSocket();
  const { settings, isLoading: settingsLoading } = useSettings();
  const [isOpen, setIsOpen] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [calibrationState, setCalibrationState] = useState<CalibrationState>({
    isResetting: false,
    isCalibrating: false,
    cameraWidthRecorded: false,
    cameraWidthTicks: null,
    calibratedJets: new Map(),
    originalCameraWidthTicks: null,
    originalCameraWidthPixels: null,
    originalJetOffsets: null,
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

    // Load existing calibration values from settings for partial update support
    const existingCalibration = settings?.positionCalibration;
    const originalCameraWidthTicks = existingCalibration?.cameraWidthInTicks ?? null;
    const originalCameraWidthPixels = existingCalibration?.cameraWidthPixels ?? null;
    const originalJetOffsets = existingCalibration?.jetEncoderOffsets
      ? ([...existingCalibration.jetEncoderOffsets] as [number, number, number, number])
      : null;

    // Reset encoder to 0 - this sets the left edge of camera as position 0
    socket.emit(AllEvents.RESET_ENCODER);

    // Set resetting state - wait for confirmation before enabling calibration
    // Pre-populate with existing values for partial calibration support
    setCalibrationState({
      isResetting: true,
      isCalibrating: false,
      cameraWidthRecorded: false, // Not marked yet this session
      cameraWidthTicks: null, // Will be set when user marks it
      calibratedJets: new Map(), // Only jets marked THIS session
      originalCameraWidthTicks,
      originalCameraWidthPixels,
      originalJetOffsets,
    });

    // Clear any existing confirmation
    setShowConfirmation(false);
    if (confirmationTimeoutRef.current) {
      clearTimeout(confirmationTimeoutRef.current);
      confirmationTimeoutRef.current = null;
    }
  };

  // Stop calibration handler - saves all calibration data at once
  const handleStopCalibration = () => {
    if (!socket) return;

    // Merge marked values with original values for partial calibration support
    // For camera width: use marked value if recorded this session, otherwise use original
    const finalCameraWidthTicks = calibrationState.cameraWidthRecorded
      ? calibrationState.cameraWidthTicks
      : calibrationState.originalCameraWidthTicks;

    const finalCameraWidthPixels = calibrationState.cameraWidthRecorded
      ? calibrationState.cameraWidthPixels
      : calibrationState.originalCameraWidthPixels ?? undefined;

    // For jets: use marked value if calibrated this session, otherwise use original
    const jetEncoderOffsets: [number, number, number, number] = [
      calibrationState.calibratedJets.has(0)
        ? calibrationState.calibratedJets.get(0)!
        : calibrationState.originalJetOffsets?.[0] ?? 0,
      calibrationState.calibratedJets.has(1)
        ? calibrationState.calibratedJets.get(1)!
        : calibrationState.originalJetOffsets?.[1] ?? 0,
      calibrationState.calibratedJets.has(2)
        ? calibrationState.calibratedJets.get(2)!
        : calibrationState.originalJetOffsets?.[2] ?? 0,
      calibrationState.calibratedJets.has(3)
        ? calibrationState.calibratedJets.get(3)!
        : calibrationState.originalJetOffsets?.[3] ?? 0,
    ];

    // Check if any values were marked this session
    const hasMarkedValues = calibrationState.cameraWidthRecorded || calibrationState.calibratedJets.size > 0;

    // Check if we have valid camera width (either marked this session or from original)
    const hasValidCameraWidth = finalCameraWidthTicks !== null && finalCameraWidthTicks > 0;

    // Save if: we have valid camera width AND (marked something new OR have valid existing config)
    if (hasValidCameraWidth && hasMarkedValues) {
      socket.emit(AllEvents.SAVE_CALIBRATION_DATA, {
        cameraWidthInTicks: finalCameraWidthTicks,
        cameraWidthPixels: finalCameraWidthPixels,
        jetEncoderOffsets,
      });
    } else if (!hasMarkedValues) {
      // Show warning if no values were marked
      showError('No calibration values were marked. Nothing to save.');
    } else if (!hasValidCameraWidth) {
      // Show warning if camera width is missing
      showError('Camera width is required. Please mark camera width or ensure existing calibration is valid.');
    }

    setCalibrationState((prev) => ({
      ...prev,
      isResetting: false,
      isCalibrating: false,
    }));

    // Only show confirmation if we actually saved something
    if (hasValidCameraWidth && hasMarkedValues) {
      setShowConfirmation(true);

      // Auto-dismiss confirmation after 5 seconds
      confirmationTimeoutRef.current = setTimeout(() => {
        setShowConfirmation(false);
        confirmationTimeoutRef.current = null;
      }, CONFIRMATION_DISPLAY_MS);
    }
  };

  // Mark camera width handler - only updates local state, saves on calibration end
  const handleMarkCameraWidth = () => {
    const widthInTicks = getInterpolatedPosition();
    const cameraWidthPixels = videoCaptureDimensions.width > 0 ? videoCaptureDimensions.width : undefined;

    // Just update local state - don't save to Firebase yet
    setCalibrationState((prev) => ({
      ...prev,
      cameraWidthRecorded: true,
      cameraWidthTicks: widthInTicks,
      cameraWidthPixels,
    }));
  };

  // Mark jet position handler - only updates local state, saves on calibration end
  const handleMarkJet = (sorterIndex: number) => {
    const offsetFromLeftEdge = getInterpolatedPosition();

    // Just update local state - don't save to Firebase yet
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
                    <li>
                      Use the <strong>physical switch on the motor driver</strong> to move the conveyor forward
                    </li>
                    <li>
                      When part reaches the <strong>right edge</strong> of camera, click &quot;Mark Camera Width&quot;
                    </li>
                    <li>Continue moving forward to each air jet and click the corresponding jet button</li>
                    <li>Click &quot;Stop Calibration&quot; when done</li>
                  </ol>
                  <p className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700">
                    <strong>Important:</strong> Do NOT move the conveyor backwards during calibration. The encoder
                    counts forward movement only.
                  </p>
                  <p className="mt-2 rounded border border-blue-200 bg-blue-50 p-2 text-xs text-blue-700">
                    <strong>Partial Calibration:</strong> You can update just specific values. Only mark the positions
                    you want to recalibrate - unmarked values will keep their existing calibration. Existing values are
                    shown in gray during calibration.
                  </p>
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
          disabled={!socket || calibrationState.isResetting || settingsLoading}
        >
          {calibrationState.isResetting
            ? 'Resetting encoder...'
            : settingsLoading
              ? 'Loading settings...'
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
          ) : calibrationState.isCalibrating && calibrationState.originalCameraWidthTicks ? (
            <span className="flex flex-col items-center">
              <span>Mark Camera Width (Right Edge)</span>
              <span className="text-xs font-normal text-gray-500">
                Existing: {calibrationState.originalCameraWidthTicks.toLocaleString()} ticks
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
              const existingOffset = calibrationState.originalJetOffsets?.[index];
              const hasExistingValue = existingOffset !== undefined && existingOffset > 0;

              // For validation, use the effective camera width (marked or original)
              const effectiveCameraWidth = calibrationState.cameraWidthRecorded
                ? calibrationState.cameraWidthTicks
                : calibrationState.originalCameraWidthTicks;

              const hasInvalidOffset =
                isMarked && effectiveCameraWidth !== null && offset !== undefined && offset <= effectiveCameraWidth;

              return (
                <div key={index} className="flex flex-col">
                  <Button
                    onClick={() => handleMarkJet(index)}
                    disabled={
                      !calibrationState.isCalibrating ||
                      (!calibrationState.cameraWidthRecorded && !calibrationState.originalCameraWidthTicks)
                    }
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
                      {isMarked ? (
                        <span className="text-xs font-normal">{offset?.toLocaleString()} ticks</span>
                      ) : calibrationState.isCalibrating && hasExistingValue ? (
                        <span className="text-xs font-normal text-gray-500">
                          Existing: {existingOffset.toLocaleString()} ticks
                        </span>
                      ) : null}
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
            <div className="font-semibold text-green-800">✓ Calibration Saved</div>
            <div className="mt-1 space-y-1">
              {/* Camera width */}
              {calibrationState.cameraWidthRecorded ? (
                <div className="text-green-700">
                  Camera width: {calibrationState.cameraWidthTicks?.toLocaleString()} ticks
                  <span className="ml-1 text-xs">(updated)</span>
                </div>
              ) : calibrationState.originalCameraWidthTicks ? (
                <div className="text-gray-600">
                  Camera width: {calibrationState.originalCameraWidthTicks.toLocaleString()} ticks
                  <span className="ml-1 text-xs">(preserved)</span>
                </div>
              ) : null}
              {/* Jet positions */}
              {SORTER_LABELS.map((label, index) => {
                const isMarked = calibrationState.calibratedJets.has(index);
                const markedOffset = calibrationState.calibratedJets.get(index);
                const existingOffset = calibrationState.originalJetOffsets?.[index];

                if (isMarked) {
                  return (
                    <div key={index} className="text-green-700">
                      Jet {label}: {markedOffset?.toLocaleString()} ticks
                      <span className="ml-1 text-xs">(updated)</span>
                    </div>
                  );
                } else if (existingOffset && existingOffset > 0) {
                  return (
                    <div key={index} className="text-gray-600">
                      Jet {label}: {existingOffset.toLocaleString()} ticks
                      <span className="ml-1 text-xs">(preserved)</span>
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
};

export default JetCalibrationPanel;
