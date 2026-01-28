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
        jetEncoderOffsets: [1000, 1000, 1000, 1000],
        fallTimeInCounts: 24,
        jetLeadCounts: 100,
      };
    }
    return settings.positionCalibration;
  }

  /**
   * Translates a pixel position to an encoder position at the time of detection.
   *
   * The calculation accounts for:
   * 1. The time elapsed since detection (parts move while being processed)
   * 2. The pixel offset from camera center
   * 3. The camera's encoder position offset
   *
   * @param pixelX - Pixel position from camera (0 = camera center/start)
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
    const encoderPosition = positionAtDetection + pixelX * calibration.countsPerPixel;

    return Math.round(encoderPosition);
  }

  /**
   * Calculates the encoder position where a jet should fire for a part.
   *
   * The jet position is the detection position plus the camera-to-jet offset
   * for the specific sorter/jet.
   *
   * @param detectionEncoderPos - Encoder position where the part was detected
   * @param sorter - Sorter/jet number (0-3)
   * @returns Encoder position where the jet should fire
   */
  public calculateJetPosition(detectionEncoderPos: number, sorter: number): number {
    const calibration = this.getCalibration();

    // Get the jet offset for this sorter (default to first offset if out of range)
    const jetOffset = calibration.jetEncoderOffsets[sorter] ?? calibration.jetEncoderOffsets[0] ?? 1000;

    return detectionEncoderPos + jetOffset;
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
