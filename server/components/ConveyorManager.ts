import { BaseComponent, ComponentConfig, ComponentStatus } from './BaseComponent';
import { DeviceManager } from './DeviceManager';
import { SocketManager } from './SocketManager';
import { ArduinoCommands } from '../../types/arduinoCommands.type';
import { EncoderPart } from '../../types/part.type';
import { SettingsManager } from './SettingsManager';
import { SorterManager } from './SorterManager';
import { DeviceName } from '../../types/deviceName.type';

// Forward declaration to avoid circular dependency
import type { SorterStateManager } from './SorterStateManager';

export interface ConveyorManagerConfig extends ComponentConfig {
  deviceManager: DeviceManager;
  socketManager: SocketManager;
  settingsManager: SettingsManager;
  sorterManager: SorterManager;
  /** Optional - set via setSorterStateManager() due to circular dependency */
  sorterStateManager?: SorterStateManager;
}

export class ConveyorManager extends BaseComponent {
  private deviceManager: DeviceManager;
  private socketManager: SocketManager;
  private settingsManager: SettingsManager;
  private sorterManager: SorterManager;
  private sorterStateManager: SorterStateManager | null = null;

  // --- Encoder-Based Part Queue ---

  /**
   * Queue of parts being tracked for position-based scheduling.
   * Sorted by jetPosition (ascending) for efficient action processing.
   */
  private encoderPartQueue: EncoderPart[] = [];

  /**
   * How many encoder counts before the jet position to send the jet queue command.
   * This gives the Arduino time to receive and queue the command.
   */
  private readonly JET_LEAD_COUNTS = 100;
  // --- Encoder Position Tracking State (Phase 2) ---

  /**
   * Current encoder position in ticks (counts).
   * Updated from Arduino EP: messages at ~10Hz.
   */
  private currentEncoderPosition: number = 0;

  /**
   * Timestamp (ms since epoch) of the last encoder position update.
   * Used for velocity calculation and interpolation.
   */
  private lastEncoderUpdateTime: number = 0;

  /**
   * Encoder velocity in counts per millisecond.
   * Smoothed using exponential moving average (alpha = 0.3).
   */
  private encoderVelocity: number = 0;

  // --- Encoder Constants ---

  /** Large negative position delta threshold that indicates Arduino counter overflow/wrap-around */
  private readonly OVERFLOW_THRESHOLD = 1000000;

  /** Exponential moving average smoothing factor for velocity (lower = more smoothing) */
  private readonly VELOCITY_SMOOTHING_ALPHA = 0.3;

  /** Velocity threshold in counts/ms - below this, velocity is considered 0 (conveyor stopped) */
  private readonly VELOCITY_STOP_THRESHOLD = 0.001;

  /** Maximum time in ms to extrapolate position beyond last update */
  private readonly MAX_INTERPOLATION_MS = 500;

  /** Time in ms after which encoder data is considered stale */
  private readonly STALE_DATA_THRESHOLD_MS = 1000;

  /** Cooldown flag to prevent rapid buffer-full processing */
  private bufferFullCooldown: boolean = false;

  // Bound callback references (to enable proper unregistration)
  private boundReinitialize: () => Promise<void>;
  private boundHandleConveyorData: (data: string) => void;
  private boundHandleReconnect: () => void;

  // Pending position request for Promise-based API
  private pendingPositionRequest: {
    resolve: (position: number) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  } | null = null;

  constructor(config: ConveyorManagerConfig) {
    super('ConveyorManager');
    this.deviceManager = config.deviceManager;
    this.socketManager = config.socketManager;
    this.settingsManager = config.settingsManager;
    this.sorterManager = config.sorterManager;

    // Bind callbacks once in constructor to ensure same reference for register/unregister
    this.boundReinitialize = this.reinitialize.bind(this);
    this.boundHandleConveyorData = this.handleConveyorData.bind(this);
    this.boundHandleReconnect = this.handleReconnect.bind(this);
  }

  public async initialize(): Promise<void> {
    try {
      this.setStatus(ComponentStatus.INITIALIZING);

      // Get settings from SettingsManager
      const settings = this.settingsManager.getSettings();
      if (!settings) {
        throw new Error('Settings not available');
      }

      // Clear encoder part queue
      this.encoderPartQueue = [];

      // Reset encoder state
      this.currentEncoderPosition = 0;
      this.lastEncoderUpdateTime = 0;
      this.encoderVelocity = 0;

      // Register for conveyor data callbacks (encoder messages)
      this.deviceManager.registerDeviceDataCallback(DeviceName.CONVEYOR_JETS, this.boundHandleConveyorData);

      // Register for device reconnect callbacks (encoder state recovery)
      this.deviceManager.registerDeviceReconnectCallback(DeviceName.CONVEYOR_JETS, this.boundHandleReconnect);

      // Register for settings updates
      this.settingsManager.registerSettingsUpdateCallback(this.boundReinitialize);

      this.setStatus(ComponentStatus.READY);
    } catch (error) {
      this.setError(error instanceof Error ? error.message : 'Unknown error initializing conveyor manager');
    }
  }

  public async reinitialize(): Promise<void> {
    await this.deinitialize();
    await this.initialize();
  }

  public async deinitialize(): Promise<void> {
    // Unregister device data callback
    this.deviceManager.unregisterDeviceDataCallback(DeviceName.CONVEYOR_JETS, this.boundHandleConveyorData);
    // Unregister device reconnect callback
    this.deviceManager.unregisterDeviceReconnectCallback(DeviceName.CONVEYOR_JETS);
    // Unregister settings callback (using same bound reference as registration)
    this.settingsManager.unregisterSettingsUpdateCallback(this.boundReinitialize);
    // Clear encoder part queue
    this.encoderPartQueue = [];

    this.setStatus(ComponentStatus.UNINITIALIZED);
  }

  public toggleConveyor(): void {
    this.deviceManager.sendCommand(DeviceName.CONVEYOR_JETS, ArduinoCommands.CONVEYOR_ON_OFF);
  }

  // --- Encoder Position Tracking Methods ---

  private handleReconnect(): void {
    console.log('\x1b[32m[ENCODER] Conveyor reconnected, syncing encoder state\x1b[0m');
    // Clear stale data
    this.encoderVelocity = 0;
    this.lastEncoderUpdateTime = 0;
    // Request current position from Arduino
    this.requestEncoderPosition()
      .then((position) => {
        console.log(`\x1b[32m[ENCODER] Synced position after reconnect: ${position}\x1b[0m`);
      })
      .catch((err) => {
        console.error('\x1b[33m[ENCODER] Failed to sync position after reconnect:\x1b[0m', err);
      });
  }

  private handleConveyorData(data: string): void {
    if (data.startsWith('EP:')) {
      // Encoder position report: EP:<position>
      const position = parseInt(data.substring(3), 10);
      if (!isNaN(position)) {
        this.updateEncoderPosition(position);

        // Resolve pending position request if one exists
        if (this.pendingPositionRequest) {
          clearTimeout(this.pendingPositionRequest.timeout);
          this.pendingPositionRequest.resolve(position);
          this.pendingPositionRequest = null;
        }
      }
    } else if (data.startsWith('JF:')) {
      // Jet fired confirmation: JF:<jet>,<position>
      const parts = data.substring(3).split(',');
      if (parts.length === 2) {
        const jet = parseInt(parts[0], 10);
        const position = parseInt(parts[1], 10);
        if (!isNaN(jet) && !isNaN(position)) {
          this.handleJetFired(jet, position);
        }
      }
    } else if (data.startsWith('JQ:')) {
      // Jet queued confirmation: JQ:<jet>,<position>
      const parts = data.substring(3).split(',');
      if (parts.length === 2) {
        const jet = parseInt(parts[0], 10);
        const position = parseInt(parts[1], 10);
        console.log(`\x1b[32m[ENCODER] Jet ${jet} queued at position ${position}\x1b[0m`);

        // Verify the queued jet matches a pending part
        const matchingPart = this.encoderPartQueue.find(
          (p) => p.jet === jet && p.jetPosition === position && p.jetCommandSent,
        );
        if (!matchingPart) {
          console.warn(`[ENCODER] JQ confirmation for unknown jet/position: ${jet}/${position}`);
        }
      }
    } else if (data.startsWith('BS:')) {
      // Buffer status: BS:<count>,<capacity>
      const parts = data.substring(3).split(',');
      if (parts.length === 2) {
        const count = parseInt(parts[0], 10);
        const capacity = parseInt(parts[1], 10);
        if (!isNaN(count) && !isNaN(capacity)) {
          this.socketManager.emitBufferStatusUpdate(count, capacity);
        }
      }
    } else if (data.startsWith('ER:')) {
      // Encoder reset confirmation: ER:0
      console.log(`\x1b[32m[ENCODER] Encoder reset confirmed: ${data}\x1b[0m`);
    } else if (data.includes('Error: Jet buffer full')) {
      // Prevent rapid re-processing if buffer stays full
      if (this.bufferFullCooldown) {
        console.warn('[ENCODER] Buffer full event ignored - cooldown active');
        return;
      }
      this.bufferFullCooldown = true;

      // Arduino buffer is full - commands are being lost
      console.error('\x1b[31m[ENCODER] Arduino jet buffer full - marking pending parts as skipped\x1b[0m');

      // Mark all parts that haven't had their jet command sent as skipped
      // These parts won't be sorted because we can't queue their jet commands
      const skippedParts = this.encoderPartQueue.filter((p) => !p.jetCommandSent && p.status !== 'skipped');

      for (const part of skippedParts) {
        part.status = 'skipped';
        this.socketManager.emitEncoderPartSkipped(
          part.partId,
          'Arduino jet buffer full',
          part.sorter,
          part.bin,
        );
        console.warn(`[ENCODER] Skipped part ${part.partId} due to buffer full`);
      }

      // Remove skipped parts from queue
      this.encoderPartQueue = this.encoderPartQueue.filter((p) => p.status !== 'skipped');

      // Also notify frontend about buffer status
      this.socketManager.emitBufferStatusUpdate(16, 16); // Full buffer

      // Reset cooldown after a short delay
      setTimeout(() => {
        this.bufferFullCooldown = false;
      }, 500);
    }
  }

  /**
   * Updates the encoder position and calculates smoothed velocity.
   * Handles overflow detection and applies exponential moving average smoothing.
   * @param position - The new encoder position in ticks (counts)
   */
  private updateEncoderPosition(position: number): void {
    // Runtime validation - guard against invalid data
    if (typeof position !== 'number' || isNaN(position)) {
      console.error('\x1b[31m[ENCODER] Invalid position received:\x1b[0m', position);
      return;
    }

    const now = Date.now();
    const elapsed = now - this.lastEncoderUpdateTime;

    // Calculate velocity from position delta (only if we have a previous update)
    if (this.lastEncoderUpdateTime > 0 && elapsed > 0) {
      const delta = position - this.currentEncoderPosition;

      // Detect overflow: large negative delta indicates Arduino wrapped around
      if (delta < -this.OVERFLOW_THRESHOLD) {
        console.warn('\x1b[33m[ENCODER] Position overflow detected, resetting velocity\x1b[0m');
        this.encoderVelocity = 0;
        // Don't calculate velocity from wrap-around delta
      } else {
        const instantVelocity = delta / elapsed; // counts per millisecond
        // Apply exponential moving average smoothing
        this.encoderVelocity =
          this.VELOCITY_SMOOTHING_ALPHA * instantVelocity + (1 - this.VELOCITY_SMOOTHING_ALPHA) * this.encoderVelocity;

        // Reset to 0 if velocity is negligible (conveyor stopped)
        if (Math.abs(this.encoderVelocity) < this.VELOCITY_STOP_THRESHOLD) {
          this.encoderVelocity = 0;
        }
      }
    }

    this.currentEncoderPosition = position;
    this.lastEncoderUpdateTime = now;

    // Process position-based actions for encoder scheduling (Phase 4)
    this.processPositionActions(position);

    // Broadcast to frontend
    this.socketManager.emitEncoderPositionUpdate(position, now, this.encoderVelocity);
  }

  /**
   * Handles a jet fired confirmation from the Arduino.
   * Updates the part status and removes it from the queue.
   * @param jet - The jet number that fired (0-3)
   * @param position - The encoder position when the jet fired
   */
  private handleJetFired(jet: number, position: number): void {
    console.log(`\x1b[32m[ENCODER] Jet ${jet} fired at encoder position ${position}\x1b[0m`);

    // Position tolerance for matching (accounts for timing differences)
    const POSITION_MATCH_TOLERANCE = 50;

    // Find the part in the encoder queue that matches this jet, position, and hasn't been sorted yet
    // Primary match: jet number + position within tolerance
    let part = this.encoderPartQueue.find(
      (p) =>
        p.jet === jet &&
        p.status !== 'sorted' &&
        Math.abs(p.jetPosition - position) <= POSITION_MATCH_TOLERANCE,
    );

    // Fallback: if no position match, find by jet number only (backwards compatibility)
    // This handles cases where Arduino position tracking drifts
    if (!part) {
      part = this.encoderPartQueue.find((p) => p.jet === jet && p.status !== 'sorted');
      if (part) {
        console.warn(
          `[JET_FIRED] Position mismatch for jet ${jet}: expected ${part.jetPosition}, actual ${position}. ` +
            `Delta: ${Math.abs(part.jetPosition - position)} ticks. Using fallback match.`,
        );
      }
    }

    if (part) {
      // Update part status
      part.status = 'sorted';

      // Remove from queue
      this.removeEncoderPart(part.partId);

      // Emit sorted event to frontend
      this.socketManager.emitEncoderPartSorted(part);

      console.log(`\x1b[32m[JET_FIRED] Jet ${jet} at position ${position} sorted part ${part.partId}\x1b[0m`);
    } else {
      console.warn(`[JET_FIRED] No matching part found for jet ${jet} at position ${position}`);
    }
  }

  /**
   * Returns the interpolated encoder position based on last known position and velocity.
   * Interpolation is capped at MAX_INTERPOLATION_MS to prevent runaway extrapolation.
   * @returns Estimated current encoder position in ticks (counts)
   */
  public getInterpolatedPosition(): number {
    if (this.lastEncoderUpdateTime === 0) {
      return this.currentEncoderPosition;
    }
    const elapsed = Date.now() - this.lastEncoderUpdateTime;
    // Cap interpolation to avoid runaway extrapolation
    const cappedElapsed = Math.min(elapsed, this.MAX_INTERPOLATION_MS);
    return Math.round(this.currentEncoderPosition + cappedElapsed * this.encoderVelocity);
  }

  /**
   * Checks if the encoder data is stale (older than STALE_DATA_THRESHOLD_MS).
   * @returns true if data is stale or no data has been received, false otherwise
   */
  public isEncoderDataStale(): boolean {
    if (this.lastEncoderUpdateTime === 0) {
      return true;
    }
    return Date.now() - this.lastEncoderUpdateTime > this.STALE_DATA_THRESHOLD_MS;
  }

  /**
   * Returns the last known encoder position without interpolation.
   * @returns Last reported encoder position in ticks (counts)
   */
  public getCurrentEncoderPosition(): number {
    return this.currentEncoderPosition;
  }

  /**
   * Returns the current smoothed encoder velocity.
   * @returns Velocity in counts per millisecond (smoothed via EMA)
   */
  public getEncoderVelocity(): number {
    return this.encoderVelocity;
  }

  /**
   * Returns a snapshot of the current encoder state.
   * Useful for position translation with accurate timestamp.
   * @returns Object containing position, timestamp, and velocity
   */
  public getEncoderSnapshot(): { position: number; timestamp: number; velocity: number } {
    return {
      position: this.currentEncoderPosition,
      timestamp: this.lastEncoderUpdateTime,
      velocity: this.encoderVelocity,
    };
  }

  // ============================================================================
  // Encoder-Based Part Queue Methods (Phase 4)
  // ============================================================================

  /**
   * Inserts a part into the encoder part queue, maintaining sort order by jetPosition.
   * @param part - The EncoderPart to insert
   */
  public insertEncoderPart(part: EncoderPart): void {
    // Find insertion index to maintain jetPosition order (ascending)
    const insertIndex = this.encoderPartQueue.findIndex((p) => p.jetPosition > part.jetPosition);

    if (insertIndex === -1) {
      this.encoderPartQueue.push(part);
    } else {
      this.encoderPartQueue.splice(insertIndex, 0, part);
    }

    console.log(
      `[ENCODER_QUEUE] Added part ${part.partId} at jetPos ${part.jetPosition}, ` +
        `queue size: ${this.encoderPartQueue.length}`,
    );
  }

  /**
   * Removes a part from the encoder part queue by partId.
   * @param partId - The ID of the part to remove
   * @returns The removed part, or null if not found
   */
  public removeEncoderPart(partId: string): EncoderPart | null {
    const index = this.encoderPartQueue.findIndex((p) => p.partId === partId);
    if (index !== -1) {
      const removed = this.encoderPartQueue.splice(index, 1)[0];
      console.log(`[ENCODER_QUEUE] Removed part ${partId}, queue size: ${this.encoderPartQueue.length}`);
      return removed;
    }
    return null;
  }

  /**
   * Gets parts that are ready for action based on current encoder position.
   * @param currentPosition - Current encoder position
   * @returns Object containing arrays of parts ready for jet queuing and move sending
   */
  public getActionableParts(currentPosition: number): {
    jetsToQueue: EncoderPart[];
    movesToSend: EncoderPart[];
  } {
    const jetsToQueue: EncoderPart[] = [];
    const movesToSend: EncoderPart[] = [];

    for (const part of this.encoderPartQueue) {
      // Skip parts that have been marked as skipped
      if (part.status === 'skipped') {
        continue;
      }

      // Check if jet command should be sent (position is within lead distance of jet)
      if (!part.jetCommandSent && currentPosition >= part.jetPosition - this.JET_LEAD_COUNTS) {
        jetsToQueue.push(part);
      }

      // Check if move command should be sent
      if (!part.moveCommandSent && currentPosition >= part.moveTriggerPosition) {
        movesToSend.push(part);
      }
    }

    return { jetsToQueue, movesToSend };
  }

  /**
   * Gets the current encoder part queue.
   * @returns Array of EncoderParts in the queue
   */
  public getEncoderPartQueue(): EncoderPart[] {
    return this.encoderPartQueue;
  }

  /**
   * Clears all encoder parts from the queue.
   * Used for reset/reinitialization.
   */
  public clearEncoderPartQueue(): void {
    const count = this.encoderPartQueue.length;
    this.encoderPartQueue = [];
    console.log(`[ENCODER_QUEUE] Cleared ${count} parts from queue`);
  }

  /**
   * Skips all encoder parts targeting a specific sorter.
   * Called when a sorter disconnects/reconnects and its state is unknown.
   * @param sorterNum - Sorter index (0-3)
   * @param reason - Reason for skipping (for logging)
   */
  public skipPartsForSorter(sorterNum: number, reason: string): void {
    const affectedParts = this.encoderPartQueue.filter(
      (p) => p.sorter === sorterNum && p.status !== 'sorted' && p.status !== 'skipped',
    );

    for (const part of affectedParts) {
      part.status = 'skipped';
      this.socketManager.emitEncoderPartSkipped(part.partId, reason, part.sorter, part.bin);
      console.warn(`[ENCODER] Skipped part ${part.partId} for sorter ${sorterNum}: ${reason}`);
    }

    // Remove skipped parts from queue
    this.encoderPartQueue = this.encoderPartQueue.filter((p) => p.status !== 'skipped');

    console.log(`[ENCODER] Skipped ${affectedParts.length} parts for sorter ${sorterNum}`);
  }

  /**
   * Sets the SorterStateManager reference.
   * Called after construction to avoid circular dependency.
   */
  public setSorterStateManager(sorterStateManager: SorterStateManager): void {
    this.sorterStateManager = sorterStateManager;
  }

  // ============================================================================
  // Position-Based Action Loop (Phase 4)
  // ============================================================================

  /**
   * Processes position-based actions for the encoder part queue.
   * Called on each encoder position update to trigger jet queuing and move commands.
   * @param currentPosition - Current encoder position
   */
  private processPositionActions(currentPosition: number): void {
    // Don't process actions if encoder data is stale
    if (this.isEncoderDataStale()) {
      console.warn('[ENCODER_ACTION] Skipping action processing - encoder data is stale');
      return;
    }

    if (this.sorterManager.isCalibrationInProgress()) {
      const reason = 'Calibration in progress - sorting disabled';
      const skippedParts = this.encoderPartQueue.filter(
        (part) => part.status !== 'sorted' && part.status !== 'skipped',
      );

      for (const part of skippedParts) {
        part.status = 'skipped';
        this.socketManager.emitEncoderPartSkipped(part.partId, reason, part.sorter, part.bin);
        console.warn(`[ENCODER_ACTION] Skipped part ${part.partId}: ${reason}`);
      }

      if (skippedParts.length > 0) {
        this.encoderPartQueue = this.encoderPartQueue.filter((part) => part.status !== 'skipped');
      }

      return;
    }

    const { jetsToQueue, movesToSend } = this.getActionableParts(currentPosition);

    // Send jet queue commands to Arduino
    for (const part of jetsToQueue) {
      this.queueJetFire(part);
      part.jetCommandSent = true;
    }

    // Send move commands to sorters
    for (const part of movesToSend) {
      this.sendMoveCommand(part);
      part.moveCommandSent = true;
      part.status = 'moving';
    }
  }

  /**
   * Queues a jet fire command with the Arduino.
   * Sends the position-triggered jet command.
   * @param part - The EncoderPart for which to queue the jet
   */
  private queueJetFire(part: EncoderPart): void {
    // Send queue jet command: q<jet>,<position>
    const command = `q${part.jet},${part.jetPosition}`;
    this.deviceManager.sendCommand(DeviceName.CONVEYOR_JETS, command);
    console.log(`[JET_QUEUE] Queued jet ${part.jet} at position ${part.jetPosition} for part ${part.partId}`);
  }

  /**
   * Sends a move command to the sorter.
   * @param part - The EncoderPart for which to send the move
   */
  private sendMoveCommand(part: EncoderPart): void {
    if (!this.sorterStateManager) {
      console.error('[ENCODER_ACTION] Cannot send move command - SorterStateManager not set');
      return;
    }

    // Send move command to sorter
    this.sorterManager.moveSorter(part.sorter, part.bin);

    // Mark move started in SorterStateManager
    this.sorterStateManager.markMoveStarted(part.sorter, part.bin);

    console.log(`[ENCODER_MOVE] Sent move to bin ${part.bin} on sorter ${part.sorter} for part ${part.partId}`);
  }

  /**
   * Requests the current encoder position from the Arduino.
   * @returns Promise that resolves with the encoder position in ticks
   * @throws Error if a request is already pending or times out after 1000ms
   */
  public requestEncoderPosition(): Promise<number> {
    return new Promise((resolve, reject) => {
      // Check if a request is already pending
      if (this.pendingPositionRequest) {
        reject(new Error('Position request already pending'));
        return;
      }

      // Set up timeout for the request
      const timeout = setTimeout(() => {
        if (this.pendingPositionRequest) {
          this.pendingPositionRequest = null;
          reject(new Error('Position request timed out'));
        }
      }, 1000);

      // Store the pending request
      this.pendingPositionRequest = { resolve, reject, timeout };

      // Send the request command
      this.deviceManager.sendCommand(DeviceName.CONVEYOR_JETS, 'e');
    });
  }

  /**
   * Resets the encoder position to zero on both Arduino and server.
   * Local state is reset immediately; Arduino will confirm with ER:0.
   */
  public resetEncoderPosition(): void {
    this.deviceManager.sendCommand(DeviceName.CONVEYOR_JETS, 'r');
    // Reset local state immediately (Arduino will confirm with ER:0)
    this.currentEncoderPosition = 0;
    this.lastEncoderUpdateTime = Date.now();
    this.encoderVelocity = 0;
  }

  protected notifyStatusChange(): void {
    this.socketManager.emitComponentStatusUpdate(this.getName(), this.getStatus(), this.getError());
  }
}
