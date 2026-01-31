// types/sortPart.dto.ts

import { z } from 'zod';

/**
 * Data Transfer Object for sorting a part.
 * Sent from frontend to server when a part is detected and classified.
 *
 * The server uses `encoderAtDetection` and `initialPosition` (pixel X) to calculate
 * the jet firing position. The `initialTime` is kept for logging/debugging.
 */
export const sortPartSchema = z.object({
  /** Unique identifier for this part */
  partId: z.string(),

  /**
   * Timestamp when part was detected (ms since epoch).
   * Kept for logging/debugging - not used for position calculations.
   */
  initialTime: z.number(),

  /**
   * Pixel X position in camera frame where part was detected.
   * Used with encoderAtDetection to calculate jet position.
   */
  initialPosition: z.number(),

  /**
   * Encoder position (ticks) when the detection frame was captured.
   * This is the ground truth position from the frontend - the server uses it directly.
   * No interpolation needed since this comes from the moment of capture.
   */
  encoderAtDetection: z.number(),

  /**
   * Camera width in pixels at the time of detection (optional).
   * Used to verify consistency with calibration settings.
   */
  cameraWidthPixels: z.number().optional(),

  /** Destination bin number determined by classifier */
  bin: z.number(),

  /** Which sorter should handle this part (0-3) */
  sorter: z.number(),
});

export type SortPartDto = z.infer<typeof sortPartSchema>;
