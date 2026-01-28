// ============================================================================
// Time-Based Part (Legacy - used with setTimeout scheduling)
// ============================================================================

export interface Part {
  partId: string;
  sorter: number;
  bin: number;
  initialPosition: number;
  initialTime: number;
  jetTime: number;
  jetRef?: NodeJS.Timeout;
  moveTime: number;
  moveRef?: NodeJS.Timeout;
  moveFinishedTime: number;
  defaultArrivalTime: number; // the time it takes for the part to reach the jet at default speed
  arrivalTimeDelay: number;
  conveyorSpeed: number;
  conveyorSpeedTime: number;
  conveyorSpeedRef?: NodeJS.Timeout;
  status: 'pending' | 'completed' | 'skipped';
}

// ============================================================================
// Encoder-Based Part (Phase 4 - used with position-based scheduling)
// ============================================================================

/**
 * Represents a part being tracked through the encoder-based scheduling system.
 * All positions are in encoder ticks (counts).
 */
export interface EncoderPart {
  /** Unique identifier for this part */
  partId: string;

  /** Encoder position where the part was when detected */
  detectionEncoderPos: number;

  /** Encoder position where the jet should fire */
  jetPosition: number;

  /** Which jet to fire (0-3, corresponds to sorter number) */
  jet: number;

  /** Which sorter handles this part (0-3) */
  sorter: number;

  /** Destination bin number */
  bin: number;

  /** Encoder position at which to send the move command to the sorter */
  moveTriggerPosition: number;

  /** Estimated encoder position when the sorter move will complete */
  expectedMoveCompletePosition: number;

  /** Whether the jet queue command has been sent to Arduino */
  jetCommandSent: boolean;

  /** Whether the move command has been sent to the sorter */
  moveCommandSent: boolean;

  /** Current status of this part */
  status: 'scheduled' | 'moving' | 'sorted' | 'skipped';

  // ---- Metadata for debugging/logging ----

  /** Original detection timestamp (ms since epoch) */
  detectionTime: number;

  /** Original pixel position from camera */
  pixelPosition: number;
}
