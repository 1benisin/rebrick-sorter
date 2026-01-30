// server/components/PositionTranslator.ts

import { ConveyorManager } from './ConveyorManager';
import { SettingsManager } from './SettingsManager';
import { PositionCalibrationType } from '../../types/settings.type';

/**
 * PositionTranslator handles the conversion between pixel positions (from camera detection)
 * and encoder positions (for position-based scheduling).
 *
 * Key responsibilities:
 * - Translate pixel positions to encoder positions at detection time
 * - Calculate jet fire positions for parts
 * - Provide calibration data access
 */
export class PositionTranslator {
  constructor(
    private conveyorManager: ConveyorManager,
    private settingsManager: SettingsManager,
  ) {}

  /**
   * Gets the current position calibration settings.
   * @returns Position calibration data
   */
  public getCalibration(): PositionCalibrationType {
    const settings = this.settingsManager.getSettings();
    if (!settings?.positionCalibration) {
      // Return defaults if not configured
      return {
        cameraEncoderOffset: 0,
        countsPerPixel: 1,
        cameraWidthInTicks: 0,
        cameraWidthPixels: 1280,
        jetEncoderOffsets: [1000, 1000, 1000, 1000],
        fallTimeInCounts: 24,
        jetLeadCounts: 100,
      };
    }
    return settings.positionCalibration;
  }

  /**
   * @deprecated Use getEncoderPositionAtTime() + calculateJetTriggerEncoder() instead.
   * This method uses the old calibration system (cameraEncoderOffset, countsPerPixel).
   * The new calibration system uses cameraWidthInTicks and left-edge-based jet offsets.
   *
   * Translates a pixel position to an encoder position at the time of detection.
   *
   * The calculation accounts for:
   * 1. The time elapsed since detection (parts move while being processed)
   * 2. The pixel offset using countsPerPixel conversion
   * 3. The camera's encoder position offset (cameraEncoderOffset)
   *
   * @param pixelX - Pixel position from camera (0 = left edge of camera view)
   * @param detectionTime - Timestamp when the part was detected (ms since epoch)
   * @returns Encoder position where the part was at detection time
   */
  public pixelToEncoderPosition(pixelX: number, detectionTime: number): number {
    const calibration = this.getCalibration();
    const snapshot = this.conveyorManager.getEncoderSnapshot();

    // If no encoder data yet, use current position with pixel offset
    if (snapshot.timestamp === 0) {
      console.warn('[POSITION_TRANSLATOR] No encoder data available, using raw position');
      return Math.round(snapshot.position + pixelX * calibration.countsPerPixel);
    }

    // Calculate position at detection time by interpolating backwards
    // The part has moved since detection, so we need to find where it was
    const timeSinceDetection = snapshot.timestamp - detectionTime;

    // If detection was in the future (clock skew), just use current position
    if (timeSinceDetection < 0) {
      console.warn('[POSITION_TRANSLATOR] Detection time is in the future, using current position');
      return Math.round(snapshot.position + pixelX * calibration.countsPerPixel);
    }

    // Interpolate back to detection time
    // Position at detection = current position - (time since detection * velocity)
    const positionAtDetection = snapshot.position - timeSinceDetection * snapshot.velocity;

    // Add pixel offset (countsPerPixel converts camera pixels to encoder counts)
    // Add cameraEncoderOffset to account for camera position relative to encoder zero
    const encoderPosition = positionAtDetection + pixelX * calibration.countsPerPixel + calibration.cameraEncoderOffset;

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/77bec187-a61d-4074-85de-e8b63550bba7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'PositionTranslator.ts:pixelToEncoderPosition',message:'Detection position calculation',data:{pixelX,detectionTime,snapshotPosition:snapshot.position,snapshotTimestamp:snapshot.timestamp,snapshotVelocity:snapshot.velocity,timeSinceDetection,positionAtDetection,cameraEncoderOffset:calibration.cameraEncoderOffset,countsPerPixel:calibration.countsPerPixel,finalEncoderPosition:Math.round(encoderPosition)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'E'})}).catch(()=>{});
    // #endregion

    return Math.round(encoderPosition);
  }

  /**
   * Maximum time in ms to interpolate backwards for detection time.
   * Beyond this, accuracy degrades significantly due to velocity estimation errors.
   * This assumes conveyor speed is relatively stable during the detection-to-processing window.
   */
  private readonly MAX_BACKWARD_INTERPOLATION_MS = 500;

  /**
   * Gets the raw encoder position at a specific point in time by interpolating
   * backwards from the current encoder state. Does NOT apply any pixel offset.
   *
   * Use this method when the new calibration system is active, as pixel-to-tick
   * conversion is handled separately by calculateJetTriggerEncoder().
   *
   * Note: This method assumes conveyor speed is relatively stable between detection
   * time and processing time. Large delays (>500ms) may result in position errors,
   * especially during speed changes.
   *
   * @param detectionTime - Timestamp when the part was detected (ms since epoch)
   * @returns Raw encoder position at the detection time (no pixel offset applied)
   */
  public getEncoderPositionAtTime(detectionTime: number): number {
    const snapshot = this.conveyorManager.getEncoderSnapshot();

    // If no encoder data yet, use current position
    if (snapshot.timestamp === 0) {
      console.warn('[POSITION_TRANSLATOR] No encoder data available, using current position');
      return snapshot.position;
    }

    const timeSinceDetection = snapshot.timestamp - detectionTime;

    // If detection was in the future (clock skew), just use current position
    if (timeSinceDetection < 0) {
      console.warn('[POSITION_TRANSLATOR] Detection time is in the future, using current position');
      return snapshot.position;
    }

    // Warn if interpolation distance is large (accuracy may be degraded)
    if (timeSinceDetection > this.MAX_BACKWARD_INTERPOLATION_MS) {
      console.warn(
        `[POSITION_TRANSLATOR] Large backward interpolation: ${timeSinceDetection}ms ` +
          `(max recommended: ${this.MAX_BACKWARD_INTERPOLATION_MS}ms). ` +
          `Position accuracy may be reduced.`,
      );
    }

    // Interpolate back to detection time
    // Position at detection = current position - (time since detection * velocity)
    return Math.round(snapshot.position - timeSinceDetection * snapshot.velocity);
  }

  /**
   * Calculates the encoder position where a jet should fire for a part.
   *
   * The jet position is the detection position plus the camera-to-jet offset
   * for the specific sorter/jet.
   *
   * @deprecated Use calculateJetTriggerEncoder() for the new calibration system
   * @param detectionEncoderPos - Encoder position where the part was detected
   * @param sorter - Sorter/jet number (0-3)
   * @returns Encoder position where the jet should fire
   */
  public calculateJetPosition(detectionEncoderPos: number, sorter: number): number {
    const calibration = this.getCalibration();

    // Get the jet offset for this sorter (default to first offset if out of range)
    const jetOffset = calibration.jetEncoderOffsets[sorter] ?? calibration.jetEncoderOffsets[0] ?? 1000;

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/77bec187-a61d-4074-85de-e8b63550bba7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'PositionTranslator.ts:calculateJetPosition',message:'Jet position calculation',data:{detectionEncoderPos,sorter,jetOffset,allJetOffsets:calibration.jetEncoderOffsets,resultJetPosition:detectionEncoderPos+jetOffset},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'E'})}).catch(()=>{});
    // #endregion

    return detectionEncoderPos + jetOffset;
  }

  /**
   * Calculate the encoder value at which to trigger a jet for a detected part.
   * Uses the new left-edge-based calibration system.
   *
   * Formula:
   * 1. Convert pixel position to ticks from camera left edge
   *    partTicksFromLeftEdge = (pixelX / cameraWidthPixels) * cameraWidthInTicks
   * 2. Get jet distance from left edge (from calibration)
   * 3. Calculate remaining distance: jetOffset - partTicksFromLeftEdge
   * 4. Trigger position = encoderAtDetection + remainingTicks
   *
   * @param pixelX - Part's X position in camera pixels (0 = left edge)
   * @param encoderAtDetection - Encoder value when detection image was captured
   * @param jetIndex - Index of jet (0-3)
   * @param cameraWidthPixels - Camera resolution width (from video capture). If not provided, uses calibration value.
   * @returns Encoder value at which to fire the jet
   */
  public calculateJetTriggerEncoder(
    pixelX: number,
    encoderAtDetection: number,
    jetIndex: number,
    cameraWidthPixels?: number,
  ): number {
    const calibration = this.getCalibration();

    // Use provided camera width or fall back to calibration setting
    const effectiveCameraWidthPixels = cameraWidthPixels ?? calibration.cameraWidthPixels;

    // Validate calibration data
    if (calibration.cameraWidthInTicks <= 0) {
      console.warn('[POSITION_TRANSLATOR] Camera width not calibrated, using fallback');
      // Fallback to old method if not calibrated
      return encoderAtDetection + (calibration.jetEncoderOffsets[jetIndex] ?? 1000);
    }

    // Validate camera width pixels
    if (effectiveCameraWidthPixels <= 0) {
      console.warn('[POSITION_TRANSLATOR] Camera width pixels invalid, using fallback');
      return encoderAtDetection + (calibration.jetEncoderOffsets[jetIndex] ?? 1000);
    }

    // Validate and clamp pixelX to expected bounds
    let clampedPixelX = pixelX;
    if (pixelX < 0) {
      console.warn(
        `[POSITION_TRANSLATOR] Negative pixelX (${pixelX}) detected. ` +
          `This may indicate a camera orientation issue. Using 0.`,
      );
      clampedPixelX = 0;
    } else if (pixelX > effectiveCameraWidthPixels) {
      console.warn(
        `[POSITION_TRANSLATOR] pixelX (${pixelX}) exceeds camera width (${effectiveCameraWidthPixels}). ` +
          `Clamping to camera width.`,
      );
      clampedPixelX = effectiveCameraWidthPixels;
    }

    // Convert pixel position to ticks from camera left edge
    const partTicksFromLeftEdge = (clampedPixelX / effectiveCameraWidthPixels) * calibration.cameraWidthInTicks;

    // Get jet distance from left edge (from calibration)
    const jetTicksFromLeftEdge = calibration.jetEncoderOffsets[jetIndex] ?? 1000;

    // Calculate remaining distance to jet
    const remainingTicks = jetTicksFromLeftEdge - partTicksFromLeftEdge;

    // Warn if part is already past the jet (negative remaining distance)
    if (remainingTicks < 0) {
      console.warn(
        `[POSITION_TRANSLATOR] Warning: Part at pixel ${pixelX} is past jet ${jetIndex}. ` +
          `Remaining ticks: ${remainingTicks.toFixed(1)}. Check calibration.`,
      );
    }

    // Log for debugging
    console.log(
      `[POSITION_TRANSLATOR] Jet trigger calc: pixelX=${pixelX}, ` +
        `encoder=${encoderAtDetection}, jet=${jetIndex}, ` +
        `partTicks=${partTicksFromLeftEdge.toFixed(1)}, jetOffset=${jetTicksFromLeftEdge}, ` +
        `remaining=${remainingTicks.toFixed(1)}, trigger=${Math.round(encoderAtDetection + remainingTicks)}`,
    );

    // Trigger encoder value = encoder at detection + remaining distance
    return Math.round(encoderAtDetection + remainingTicks);
  }

  /**
   * Check if the position calibration data is valid for translation.
   * Returns false if cameraWidthInTicks is 0 (uncalibrated) or if
   * no jet offsets have been calibrated.
   *
   * @returns true if calibration is valid, false otherwise
   */
  public isCalibrated(): boolean {
    const calibration = this.getCalibration();
    return (
      calibration.cameraWidthInTicks > 0 &&
      calibration.cameraWidthPixels > 0 &&
      calibration.jetEncoderOffsets.length === 4 &&
      calibration.jetEncoderOffsets.every((offset) => offset > 0)
    );
  }

  /**
   * Calculates the encoder position by which a sorter must be in position.
   * This is the jet position minus the fall time in counts.
   *
   * @param jetPosition - Encoder position where the jet fires
   * @returns Encoder position by which the sorter must be ready
   */
  public calculateRequiredByPosition(jetPosition: number): number {
    const calibration = this.getCalibration();
    return jetPosition - calibration.fallTimeInCounts;
  }

  /**
   * Gets the number of encoder counts before the jet position
   * at which to send the jet queue command to the Arduino.
   *
   * @returns Jet lead counts from calibration
   */
  public getJetLeadCounts(): number {
    return this.getCalibration().jetLeadCounts;
  }

  /**
   * Gets the fall time in encoder counts.
   *
   * @returns Fall time in counts from calibration
   */
  public getFallTimeInCounts(): number {
    return this.getCalibration().fallTimeInCounts;
  }
}
