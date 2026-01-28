// types/sortPart.dto.ts

import { z } from 'zod';

/**
 * Data Transfer Object for sorting a part.
 * Sent from frontend to server when a part is detected and classified.
 *
 * The server uses `initialTime` and `initialPosition` to calculate
 * encoder positions via the PositionTranslator.
 */
export const sortPartSchema = z.object({
  /** Unique identifier for this part */
  partId: z.string(),

  /**
   * Timestamp when part was detected (ms since epoch).
   * Used by server for encoder position interpolation.
   */
  initialTime: z.number(),

  /**
   * Pixel X position in camera frame where part was detected.
   * Server translates this to encoder position using calibration settings.
   */
  initialPosition: z.number(),

  /** Destination bin number determined by classifier */
  bin: z.number(),

  /** Which sorter should handle this part (0-3) */
  sorter: z.number(),
});

export type SortPartDto = z.infer<typeof sortPartSchema>;
