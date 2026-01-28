import { BaseComponent, ComponentConfig, ComponentStatus } from './BaseComponent';
import { DeviceManager } from './DeviceManager';
import { SocketManager } from './SocketManager';
import { SettingsManager } from './SettingsManager';
import { SorterManager } from './SorterManager';
import { ConveyorManager } from './ConveyorManager';
import { DeviceName } from '../../types/deviceName.type';

/**
 * Represents a scheduled sorter move in the queue.
 */
export interface ScheduledMove {
  /** Unique identifier for the part being sorted */
  partId: string;
  /** Target bin number */
  bin: number;
  /** Encoder position at which to send the move command */
  triggerPosition: number;
  /** Estimated encoder position when the move will complete */
  expectedCompletePosition: number;
}

/**
 * Represents the current state of a single sorter.
 */
export interface SorterState {
  /** Confirmed bin position from MC: response */
  currentBin: number;
  /** True between move command sent and MC: received */
  isMoving: boolean;
  /** Bin being moved to, null if not moving */
  targetBin: number | null;
  /** Encoder position when the last move completed */
  lastMoveCompletePosition: number;
  /** Encoder position when the current move was started (for accurate free position calculation) */
  moveStartPosition: number;
  /** Queue of upcoming scheduled moves, ordered by triggerPosition */
  scheduledMoves: ScheduledMove[];
}

/**
 * Result of a sorter availability check.
 */
export interface AvailabilityResult {
  /** Whether the sorter can reach the target bin in time */
  available: boolean;
  /** Encoder position at which to trigger the move command */
  triggerPosition: number;
  /** Reason for unavailability (for logging/debugging) */
  reason?: string;
}

export interface SorterStateManagerConfig extends ComponentConfig {
  deviceManager: DeviceManager;
  socketManager: SocketManager;
  settingsManager: SettingsManager;
  sorterManager: SorterManager;
  conveyorManager: ConveyorManager;
}

/**
 * SorterStateManager provides centralized sorter state tracking for the encoder-based
 * position system. It tracks confirmed positions from MC: responses, manages scheduled
 * moves, and provides availability calculations for part scheduling.
 *
 * Key responsibilities:
 * - Track confirmed sorter positions (from MC: messages, not optimistic updates)
 * - Maintain scheduled moves queue per sorter
 * - Calculate sorter availability for new parts
 * - Convert travel times to encoder counts
 */
export class SorterStateManager extends BaseComponent {
  private deviceManager: DeviceManager;
  private socketManager: SocketManager;
  private settingsManager: SettingsManager;
  private sorterManager: SorterManager;
  private conveyorManager: ConveyorManager;

  /** State for each sorter, keyed by sorter number (0-3) */
  private sorterStates: Map<number, SorterState> = new Map();

  /** Bound callback for settings updates (prevents memory leak) */
  private boundReinitialize: () => Promise<void>;

  /** Bound callbacks for each sorter's data handler (prevents memory leak) */
  private boundHandleSorterData: Map<DeviceName, (data: string) => void> = new Map();

  /** Bound callbacks for each sorter's reconnect handler (prevents memory leak) */
  private boundHandleReconnect: Map<DeviceName, () => void> = new Map();

  /** Default velocity to use when conveyor is stopped (counts per millisecond) */
  private readonly DEFAULT_VELOCITY = 0.02; // ~20 counts/sec

  /** Minimum velocity threshold - below this, use default velocity */
  private readonly MIN_VELOCITY_THRESHOLD = 0.001;

  constructor(config: SorterStateManagerConfig) {
    super('SorterStateManager');
    this.deviceManager = config.deviceManager;
    this.socketManager = config.socketManager;
    this.settingsManager = config.settingsManager;
    this.sorterManager = config.sorterManager;
    this.conveyorManager = config.conveyorManager;

    // Create bound callback for settings updates
    this.boundReinitialize = this.reinitialize.bind(this);
  }

  public async initialize(): Promise<void> {
    try {
      this.setStatus(ComponentStatus.INITIALIZING);

      const settings = this.settingsManager.getSettings();
      if (!settings) {
        throw new Error('Settings not available');
      }

      const sorterCount = settings.sorters.length;

      // Initialize state for each sorter
      for (let i = 0; i < sorterCount; i++) {
        const currentBin = this.sorterManager.getCurrentPosition(i);
        const state: SorterState = {
          currentBin,
          isMoving: false,
          targetBin: null,
          lastMoveCompletePosition: 0,
          moveStartPosition: 0,
          scheduledMoves: [],
        };
        this.sorterStates.set(i, state);
        console.log(`[SORTER_STATE] Initialized sorter ${i} at bin ${currentBin}`);
      }

      // Register callbacks for MC: responses from each sorter
      for (let i = 0; i < sorterCount; i++) {
        const deviceName = DeviceName[`SORTER_${i}` as keyof typeof DeviceName];
        if (deviceName) {
          const callback = this.createSorterDataHandler(i);
          this.boundHandleSorterData.set(deviceName, callback);
          this.deviceManager.registerDeviceDataCallback(deviceName, callback);
          console.log(`[SORTER_STATE] Registered data callback for ${deviceName}`);
        }
      }

      // Register callbacks for sorter reconnection events
      for (let i = 0; i < sorterCount; i++) {
        const deviceName = DeviceName[`SORTER_${i}` as keyof typeof DeviceName];
        if (deviceName) {
          const reconnectCallback = this.createReconnectHandler(i);
          this.boundHandleReconnect.set(deviceName, reconnectCallback);
          this.deviceManager.registerDeviceReconnectCallback(deviceName, reconnectCallback);
          console.log(`[SORTER_STATE] Registered reconnect callback for ${deviceName}`);
        }
      }

      // Register for settings updates
      this.settingsManager.registerSettingsUpdateCallback(this.boundReinitialize);

      this.setStatus(ComponentStatus.READY);
      console.log('[SORTER_STATE] SorterStateManager initialized successfully');
    } catch (error) {
      this.setError(error instanceof Error ? error.message : 'Unknown error initializing SorterStateManager');
    }
  }

  public async reinitialize(): Promise<void> {
    await this.deinitialize();
    await this.initialize();
  }

  public async deinitialize(): Promise<void> {
    // Unregister settings callback
    this.settingsManager.unregisterSettingsUpdateCallback(this.boundReinitialize);

    // Unregister all sorter data callbacks
    for (const [deviceName, callback] of this.boundHandleSorterData) {
      this.deviceManager.unregisterDeviceDataCallback(deviceName);
    }
    this.boundHandleSorterData.clear();

    // Unregister all sorter reconnect callbacks
    for (const [deviceName, callback] of this.boundHandleReconnect) {
      this.deviceManager.unregisterDeviceReconnectCallback(deviceName);
    }
    this.boundHandleReconnect.clear();

    // Clear state
    this.sorterStates.clear();

    this.setStatus(ComponentStatus.UNINITIALIZED);
  }

  // ============================================================================
  // State Query Methods
  // ============================================================================

  /**
   * Get the full state for a sorter.
   */
  public getSorterState(sorterNum: number): SorterState | undefined {
    return this.sorterStates.get(sorterNum);
  }

  /**
   * Get the confirmed current bin for a sorter.
   */
  public getCurrentBin(sorterNum: number): number {
    const state = this.sorterStates.get(sorterNum);
    return state?.currentBin ?? 1;
  }

  /**
   * Check if a sorter is currently moving.
   */
  public isSorterMoving(sorterNum: number): boolean {
    const state = this.sorterStates.get(sorterNum);
    return state?.isMoving ?? false;
  }

  /**
   * Get the scheduled moves queue for a sorter.
   */
  public getScheduledMoves(sorterNum: number): ScheduledMove[] {
    const state = this.sorterStates.get(sorterNum);
    return state?.scheduledMoves ?? [];
  }

  // ============================================================================
  // Data Handlers
  // ============================================================================

  /**
   * Creates a bound callback handler for a specific sorter's data.
   */
  private createSorterDataHandler(sorterNum: number): (data: string) => void {
    return (data: string) => {
      this.handleSorterData(sorterNum, data);
    };
  }

  /**
   * Creates a bound callback handler for a specific sorter's reconnection.
   */
  private createReconnectHandler(sorterNum: number): () => void {
    return () => {
      this.handleSorterReconnect(sorterNum);
    };
  }

  /**
   * Handles a sorter Arduino reconnection event.
   * Resets in-flight state since the sorter may have reset to home position.
   */
  private handleSorterReconnect(sorterNum: number): void {
    const state = this.sorterStates.get(sorterNum);
    if (!state) {
      console.warn(`[SORTER_STATE] Reconnect event for unknown sorter ${sorterNum}`);
      return;
    }

    console.log(`[SORTER_STATE] Sorter ${sorterNum} reconnected, resetting state`);

    // After reconnect, sorter position is unknown until MC: received
    // Clear any in-flight move state
    state.isMoving = false;
    state.targetBin = null;

    // Clear scheduled moves as they may now be invalid
    // (the sorter may have reset and trigger positions may be in the past)
    const clearedMoveCount = state.scheduledMoves.length;
    state.scheduledMoves = [];

    if (clearedMoveCount > 0) {
      console.warn(
        `[SORTER_STATE] Cleared ${clearedMoveCount} scheduled moves for sorter ${sorterNum} after reconnect`,
      );
    }

    // Emit update to frontend
    this.socketManager.emitSorterStateUpdate(sorterNum, {
      currentBin: state.currentBin,
      isMoving: false,
      targetBin: null,
      scheduledMoveCount: 0,
      encoderPosition: this.conveyorManager.getInterpolatedPosition(),
    });
  }

  /**
   * Handles incoming data from a sorter Arduino.
   * Parses MC: (move complete) messages and updates state.
   */
  private handleSorterData(sorterNum: number, data: string): void {
    // Parse MC: response: "MC:45" or "MC: 45"
    const mcMatch = data.match(/^MC:\s*(\d+)$/);
    if (mcMatch) {
      const bin = parseInt(mcMatch[1], 10);
      this.handleMoveComplete(sorterNum, bin);
    }
  }

  /**
   * Handles a move complete event from a sorter.
   * Updates state and removes the completed move from the schedule.
   */
  private handleMoveComplete(sorterNum: number, bin: number): void {
    const state = this.sorterStates.get(sorterNum);
    if (!state) {
      console.warn(`[SORTER_STATE] Received MC: for unknown sorter ${sorterNum}`);
      return;
    }

    const currentPosition = this.conveyorManager.getInterpolatedPosition();

    // Update state
    state.currentBin = bin;
    state.isMoving = false;
    state.targetBin = null;
    state.lastMoveCompletePosition = currentPosition;

    // Find and remove the matching scheduled move by bin number
    const moveIndex = state.scheduledMoves.findIndex((m) => m.bin === bin);
    if (moveIndex !== -1) {
      const completedMove = state.scheduledMoves.splice(moveIndex, 1)[0];
      console.log(`[SORTER_STATE] Sorter ${sorterNum} completed move for part ${completedMove.partId} to bin ${bin}`);
    } else if (state.scheduledMoves.length > 0) {
      // No matching move found - likely a manual move
      console.warn(
        `[SORTER_STATE] Sorter ${sorterNum} completed move to bin ${bin}, but no matching scheduled move found. ` +
          `This may be a manual move. Scheduled moves remain: ${state.scheduledMoves.length}`,
      );
      // Don't remove any scheduled moves for manual moves
    }

    // Emit update to frontend
    this.socketManager.emitSorterStateUpdate(sorterNum, {
      currentBin: bin,
      isMoving: false,
      targetBin: null,
      scheduledMoveCount: state.scheduledMoves.length,
      encoderPosition: currentPosition,
    });

    console.log(`[SORTER_STATE] Sorter ${sorterNum} arrived at bin ${bin} at position ${currentPosition}`);
  }

  // ============================================================================
  // Availability & Lead Time Calculations
  // ============================================================================

  /**
   * Determines the effective "from bin" for calculating travel time.
   * This is the bin the sorter will be at before starting a new move.
   */
  public getEffectiveFromBin(sorterNum: number): number {
    const state = this.sorterStates.get(sorterNum);
    if (!state) {
      return 1; // Default to bin 1
    }

    // If there are scheduled moves, return the last scheduled destination
    if (state.scheduledMoves.length > 0) {
      return state.scheduledMoves[state.scheduledMoves.length - 1].bin;
    }

    // If currently moving, return the target bin
    if (state.isMoving && state.targetBin !== null) {
      return state.targetBin;
    }

    // Otherwise, return the current confirmed bin
    return state.currentBin;
  }

  /**
   * Gets the encoder position at which the sorter will be free to start a new move.
   */
  private getFreePosition(sorterNum: number): number {
    const state = this.sorterStates.get(sorterNum);
    if (!state) {
      return this.conveyorManager.getInterpolatedPosition();
    }

    // If there are scheduled moves, free after the last one completes
    if (state.scheduledMoves.length > 0) {
      return state.scheduledMoves[state.scheduledMoves.length - 1].expectedCompletePosition;
    }

    // If currently moving, estimate when it will complete based on when the move started
    if (state.isMoving && state.targetBin !== null) {
      const travelTimeMs = this.sorterManager.getTravelTimeBetweenBins({
        sorter: sorterNum,
        fromBin: state.currentBin,
        toBin: state.targetBin,
      });
      const velocity = this.getEffectiveVelocity();
      const estimatedCounts = Math.ceil(travelTimeMs * velocity);
      // Use moveStartPosition for accurate estimation of when the move will complete
      return state.moveStartPosition + estimatedCounts;
    }

    // If idle, free now
    return this.conveyorManager.getInterpolatedPosition();
  }

  /**
   * Gets the effective encoder velocity, using a default if velocity is too low.
   */
  private getEffectiveVelocity(): number {
    const velocity = this.conveyorManager.getEncoderVelocity();
    if (velocity <= this.MIN_VELOCITY_THRESHOLD) {
      return this.DEFAULT_VELOCITY;
    }
    return velocity;
  }

  /**
   * Calculates the number of encoder counts needed for a sorter to travel
   * between two bins.
   *
   * @param sorterNum - Sorter index (0-3)
   * @param fromBin - Starting bin number
   * @param toBin - Destination bin number
   * @returns Number of encoder counts for the travel time
   */
  public calculateLeadCounts(sorterNum: number, fromBin: number, toBin: number): number {
    // Same bin = no movement needed
    if (fromBin === toBin) {
      return 0;
    }

    // Get travel time in milliseconds from SorterManager
    const travelTimeMs = this.sorterManager.getTravelTimeBetweenBins({
      sorter: sorterNum,
      fromBin,
      toBin,
    });

    // Get effective velocity (counts per millisecond)
    const velocity = this.getEffectiveVelocity();

    // Convert to encoder counts, rounding up for safety
    return Math.ceil(travelTimeMs * velocity);
  }

  /**
   * Checks if a sorter can reach a target bin by a required encoder position.
   *
   * @param sorterNum - Sorter index (0-3)
   * @param targetBin - Desired bin number
   * @param requiredByPosition - Encoder position by which the sorter must arrive
   * @returns Availability result with trigger position or reason for unavailability
   */
  public canSorterReachBin(sorterNum: number, targetBin: number, requiredByPosition: number): AvailabilityResult {
    const state = this.sorterStates.get(sorterNum);
    if (!state) {
      return {
        available: false,
        triggerPosition: 0,
        reason: `Invalid sorter number: ${sorterNum}`,
      };
    }

    // 1. Determine when the sorter will be free
    const freePosition = this.getFreePosition(sorterNum);

    // 2. Determine the effective "from bin"
    const fromBin = this.getEffectiveFromBin(sorterNum);

    // 3. If already at target bin, no movement needed
    if (fromBin === targetBin) {
      return {
        available: true,
        triggerPosition: freePosition, // No move needed, but return free position for consistency
      };
    }

    // 4. Calculate lead counts (travel time in encoder counts)
    const leadCounts = this.calculateLeadCounts(sorterNum, fromBin, targetBin);

    // 5. Calculate earliest arrival position
    const arrivalPosition = freePosition + leadCounts;

    // 6. Check if sorter can arrive in time
    if (arrivalPosition > requiredByPosition) {
      return {
        available: false,
        triggerPosition: 0,
        reason:
          `Sorter ${sorterNum} cannot reach bin ${targetBin} in time. ` +
          `Needs to arrive at ${arrivalPosition} but required by ${requiredByPosition}. ` +
          `Free at ${freePosition}, lead counts: ${leadCounts}`,
      };
    }

    // 7. Calculate optimal trigger position
    // If free position plus lead time still leaves room, we can delay the trigger
    // Otherwise, trigger as soon as free
    let triggerPosition: number;
    if (freePosition + leadCounts <= requiredByPosition) {
      // We have flexibility - trigger so arrival is just in time
      triggerPosition = Math.max(freePosition, requiredByPosition - leadCounts);
    } else {
      // No flexibility - trigger immediately when free
      triggerPosition = freePosition;
    }

    return {
      available: true,
      triggerPosition,
    };
  }

  // ============================================================================
  // Move Scheduling
  // ============================================================================

  /**
   * Schedules a move for a sorter at a specific encoder position.
   * The move is added to the sorter's queue in trigger position order.
   *
   * @param sorterNum - Sorter index (0-3)
   * @param bin - Target bin number
   * @param partId - ID of the part being sorted
   * @param triggerPosition - Encoder position at which to send the move command
   */
  public scheduleMove(sorterNum: number, bin: number, partId: string, triggerPosition: number): void {
    const state = this.sorterStates.get(sorterNum);
    if (!state) {
      throw new Error(`Invalid sorter number: ${sorterNum}`);
    }

    // Calculate expected complete position
    const fromBin = this.getEffectiveFromBin(sorterNum);
    const leadCounts = this.calculateLeadCounts(sorterNum, fromBin, bin);
    const expectedCompletePosition = triggerPosition + leadCounts;

    // Create scheduled move
    const move: ScheduledMove = {
      partId,
      bin,
      triggerPosition,
      expectedCompletePosition,
    };

    // Insert in trigger position order
    const insertIdx = state.scheduledMoves.findIndex((m) => m.triggerPosition > triggerPosition);
    if (insertIdx === -1) {
      state.scheduledMoves.push(move);
    } else {
      state.scheduledMoves.splice(insertIdx, 0, move);
    }

    console.log(
      `[SORTER_STATE] Scheduled move for sorter ${sorterNum}: ` +
        `part ${partId} -> bin ${bin} at position ${triggerPosition} ` +
        `(expected complete at ${expectedCompletePosition})`,
    );
  }

  /**
   * Marks a move as started (called when the move command is sent).
   * This updates the sorter's isMoving state and records the start position
   * for accurate free position calculations.
   *
   * @param sorterNum - Sorter index (0-3)
   * @param targetBin - Bin being moved to
   */
  public markMoveStarted(sorterNum: number, targetBin: number): void {
    const state = this.sorterStates.get(sorterNum);
    if (!state) {
      console.warn(`[SORTER_STATE] markMoveStarted called for unknown sorter ${sorterNum}`);
      return;
    }

    const currentPosition = this.conveyorManager.getInterpolatedPosition();

    state.isMoving = true;
    state.targetBin = targetBin;
    state.moveStartPosition = currentPosition;

    // Emit update to frontend
    this.socketManager.emitSorterStateUpdate(sorterNum, {
      currentBin: state.currentBin,
      isMoving: true,
      targetBin,
      scheduledMoveCount: state.scheduledMoves.length,
      encoderPosition: currentPosition,
    });

    console.log(`[SORTER_STATE] Sorter ${sorterNum} started moving to bin ${targetBin} at position ${currentPosition}`);
  }

  /**
   * Clears all scheduled moves for a sorter.
   * Useful for testing, calibration, or emergency stop.
   *
   * @param sorterNum - Sorter index (0-3)
   */
  public clearScheduledMoves(sorterNum: number): void {
    const state = this.sorterStates.get(sorterNum);
    if (!state) {
      return;
    }

    const count = state.scheduledMoves.length;
    state.scheduledMoves = [];
    console.log(`[SORTER_STATE] Cleared ${count} scheduled moves for sorter ${sorterNum}`);
  }

  /**
   * Clears all scheduled moves for all sorters.
   */
  public clearAllScheduledMoves(): void {
    for (const [sorterNum] of this.sorterStates) {
      this.clearScheduledMoves(sorterNum);
    }
  }

  protected notifyStatusChange(): void {
    this.socketManager.emitComponentStatusUpdate(this.getName(), this.getStatus(), this.getError());
  }
}
