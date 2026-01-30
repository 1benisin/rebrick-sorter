// types/settings.type.ts

import { z } from 'zod';
import { serialPortNameEnumSchema } from './serialPort.type';

// ============================================================================
// Position Calibration (Phase 4 - Encoder-based scheduling)
// ============================================================================

export const positionCalibrationSchema = z.object({
  /**
   * @deprecated Use cameraWidthInTicks and left-edge-based jetEncoderOffsets instead.
   * This field recorded encoder position at camera center - the new system uses
   * camera left edge as the zero reference point.
   */
  cameraEncoderOffset: z.coerce.number().default(0),
  /** Encoder counts per camera pixel (typically negative since camera is upstream) */
  countsPerPixel: z.coerce.number().default(1),
  /**
   * Width of camera view in encoder ticks (from left edge to right edge).
   * Used for pixel-to-tick translation: pixelTicks = (pixelX / cameraWidthPixels) * cameraWidthInTicks
   * A value of 0 indicates uncalibrated.
   */
  cameraWidthInTicks: z.coerce.number().default(0),
  /**
   * Camera resolution width in pixels.
   * Used together with cameraWidthInTicks to calculate the pixel-to-tick ratio.
   * This should match the actual video capture width used during detection.
   */
  cameraWidthPixels: z.coerce.number().default(1280),
  /**
   * Encoder tick distance from camera LEFT EDGE to each air jet.
   * Array indices 0-3 correspond to Jets A-D (sorters 0-3).
   * These offsets are measured during calibration by:
   * 1. Resetting encoder to 0 with part at camera left edge
   * 2. Moving part to each jet and recording the encoder position
   * Default is [0,0,0,0] to indicate uncalibrated state.
   */
  jetEncoderOffsets: z.array(z.coerce.number()).default([0, 0, 0, 0]),
  /** Encoder counts for part to fall from jet to sorter position */
  fallTimeInCounts: z.coerce.number().default(24),
  /** How far ahead (in encoder counts) to send jet commands to Arduino */
  jetLeadCounts: z.coerce.number().default(100),
});

export type PositionCalibrationType = z.infer<typeof positionCalibrationSchema>;

export const sorterSettingsSchema = z.object({
  name: serialPortNameEnumSchema.default(serialPortNameEnumSchema.Values.conveyor_jets),
  serialPort: z.string().min(1).default('default'),
  jetPositionStart: z.coerce
    .number()
    .min(0, { message: 'Start jet position must be a non-negative number' })
    .max(99999, { message: 'Start jet position exceeds maximum allowed value' })
    .default(0),
  jetDuration: z.coerce
    .number()
    .min(1, { message: 'Jet duration must be at least 1 millisecond' })
    .max(1000, { message: 'Jet duration exceeds maximum allowed value' })
    .default(100),
  maxPartDimensions: z
    .object({
      width: z.coerce.number().min(1, { message: 'Part width must be at least 1 unit' }).default(1),
      height: z.coerce.number().min(1, { message: 'Part height must be at least 1 unit' }).default(1),
    })
    .default({ width: 1, height: 1 }),
  gridDimension: z.coerce.number().min(1).default(12),
  xOffset: z.coerce.number().default(10),
  yOffset: z.coerce.number().default(10),
  xStepsToLast: z.coerce.number().default(6085),
  yStepsToLast: z.coerce.number().default(6100),
  acceleration: z.coerce.number().min(0).default(5000),
  homingSpeed: z.coerce.number().min(0).default(1000),
  speed: z.coerce.number().min(0).default(120),
  rowMajorOrder: z.boolean().default(true),
});

export type SorterSettingsType = z.infer<typeof sorterSettingsSchema>;

export const settingsSchema = z.object({
  conveyorSpeed: z.coerce.number().min(0, { message: 'Conveyor speed must be a non-negative number' }).default(1),
  maxConveyorRPM: z.coerce
    .number()
    .min(0, { message: 'Maximum conveyor RPM must be a non-negative number' })
    .default(100),
  minConveyorRPM: z.coerce
    .number()
    .min(0, { message: 'Minimum conveyor RPM must be a non-negative number' })
    .default(50),
  constantConveyorSpeed: z.boolean().default(false),
  detectDistanceThreshold: z.coerce
    .number()
    .min(1, { message: 'Detection threshold must be at least 1 unit' })
    .default(1),
  conveyorJetsSerialPort: z.string().default(''),
  hopperFeederSerialPort: z.string().default(''),
  classificationThresholdPercentage: z.coerce
    .number()
    .min(0, { message: 'Classification threshold must be between 0 and 2' })
    .max(2, { message: 'Classification threshold must be between 0 and 2' })
    .default(1),
  camera1VerticalPositionPercentage: z.coerce.number().default(1),
  camera2VerticalPositionPercentage: z.coerce.number().default(-35),
  videoStreamId1: z.string().default(''), // deviceId
  videoStreamId2: z.string().default(''), // deviceId
  feederVibrationSpeed: z.coerce.number().min(0).max(255).default(200),
  feederStopDelay: z.coerce.number().min(0).default(5),
  feederPauseTime: z.coerce.number().min(0).default(1000),
  feederShortMoveTime: z.coerce.number().min(0).default(250),
  feederLongMoveTime: z.coerce.number().min(0).default(2000),
  conveyorPulsesPerRevolution: z.coerce.number().min(0).default(20),
  conveyorKp: z.coerce.number().min(0).default(1.0),
  conveyorKi: z.coerce.number().min(0).default(0.15),
  conveyorKd: z.coerce.number().min(0).default(0.0),
  sorters: z.array(sorterSettingsSchema).default([]),
  hopperCycleInterval: z.coerce.number().min(0).default(20000),
  hopperCycleSteps: z.coerce.number().min(100).max(10000).default(2020),
  /** Position calibration for encoder-based scheduling (Phase 4) */
  positionCalibration: positionCalibrationSchema.default({}),
  /** Feature flag: use encoder-based scheduling instead of time-based */
  useEncoderScheduling: z.boolean().default(false),
});

export type SettingsType = z.infer<typeof settingsSchema>;
