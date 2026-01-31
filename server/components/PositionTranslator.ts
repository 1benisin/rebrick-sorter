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
