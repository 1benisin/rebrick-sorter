import { BaseComponent, ComponentConfig, ComponentStatus } from './BaseComponent';
import { DeviceManager } from './DeviceManager';
import { SocketManager } from './SocketManager';
import { ArduinoCommands } from '../../types/arduinoCommands.type';
import { Part, EncoderPart } from '../../types/part.type';
import { SettingsManager } from './SettingsManager';
import { SpeedManager } from './SpeedManager';
import { SorterManager } from './SorterManager';
import { DeviceName } from '../../types/deviceName.type';
import { SortPartDto } from '../../types/sortPart.dto';

// Forward declaration to avoid circular dependency
import type { SorterStateManager } from './SorterStateManager';

interface ReturnToDefaultSpeed {
  time: number;
  speed: number;
  ref: NodeJS.Timeout;
}

export interface ConveyorManagerConfig extends ComponentConfig {
  deviceManager: DeviceManager;
  socketManager: SocketManager;
  settingsManager: SettingsManager;
  speedManager: SpeedManager;
  sorterManager: SorterManager;
  buildPart: (part: SortPartDto) => Part;
  /** Optional - set via setSorterStateManager() due to circular dependency */
  sorterStateManager?: SorterStateManager;
}

export class ConveyorManager extends BaseComponent {
  private deviceManager: DeviceManager;
  private socketManager: SocketManager;
  private settingsManager: SettingsManager;
  private speedManager: SpeedManager;
  private sorterManager: SorterManager;
  private sorterStateManager: SorterStateManager | null = null;
  private buildPart: (part: SortPartDto) => Part;
  private jetPositionsStart: number[] = [];
  private jetDurations: number[] = [];
  private partQueue: Part[] = [];
  private speedLog: { time: number; speed: number }[] = [];
  private isRecalculating: boolean = false;
  private returnToDefaultConveyorSpeed: ReturnToDefaultSpeed | null = null;

  // --- Encoder-Based Part Queue (Phase 4) ---

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
    this.speedManager = config.speedManager;
    this.sorterManager = config.sorterManager;
    this.buildPart = config.buildPart;

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

      // Initialize from settings
      this.jetPositionsStart = settings.sorters.map((sorter) => sorter.jetPositionStart);
      this.jetDurations = settings.sorters.map((sorter) => sorter.jetDuration);
      this.partQueue = [];
      this.speedLog = [];
      this.encoderPartQueue = []; // Clear encoder queue (Phase 4)

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
    this.deviceManager.unregisterDeviceDataCallback(DeviceName.CONVEYOR_JETS);
    // Unregister device reconnect callback
    this.deviceManager.unregisterDeviceReconnectCallback(DeviceName.CONVEYOR_JETS);
    // Unregister settings callback (using same bound reference as registration)
    this.settingsManager.unregisterSettingsUpdateCallback(this.boundReinitialize);
    // clear all part actions
    this.partQueue.forEach((part) => {
      if (part.moveRef) clearTimeout(part.moveRef);
      if (part.jetRef) clearTimeout(part.jetRef);
      if (part.conveyorSpeedRef) clearTimeout(part.conveyorSpeedRef);
    });
    if (this.returnToDefaultConveyorSpeed) {
      clearTimeout(this.returnToDefaultConveyorSpeed.ref);
      this.returnToDefaultConveyorSpeed = null;
    }
    this.partQueue = [];
    this.speedLog = [];
    this.encoderPartQueue = []; // Clear encoder queue (Phase 4)

    this.setStatus(ComponentStatus.UNINITIALIZED);
  }

  public toggleConveyor(): void {
    this.deviceManager.sendCommand(DeviceName.CONVEYOR_JETS, ArduinoCommands.CONVEYOR_ON_OFF);
  }

  public getCurrentSpeed(): number {
    return this.speedManager.getCurrentSpeed();
  }

  public getJetPosition(sorter: number): number {
    return this.jetPositionsStart[sorter] + this.jetDurations[sorter] / 2;
  }

  public findPreviousSorterPart(sorter: number): Part | null {
    return this.partQueue.reduce<Part | null>((acc, p) => {
      if (p.sorter === sorter) return p;
      return acc;
    }, null);
  }

  public findPreviousConveyorPart(defaultArrivalTime: number): Part | null {
    return this.partQueue.reduce<Part | null>((acc, p) => {
      if (p.defaultArrivalTime < defaultArrivalTime) return p;
      return acc;
    }, null);
  }

  public findNextConveyorPart(defaultArrivalTime: number): Part | null {
    return this.partQueue.find((p) => p.defaultArrivalTime > defaultArrivalTime) || null;
  }

  private trimSpeedLog(): void {
    if (this.partQueue.length === 0) {
      this.speedLog = [];
      return;
    }

    // Find earliest initial time among all parts
    const earliestInitialTime = Math.min(...this.partQueue.map((p) => p.initialTime));

    // Remove all speed log entries before the earliest part's initial time
    this.speedLog = this.speedLog.filter((entry) => entry.time >= earliestInitialTime);
  }

  public addSpeedToLog(time: number, speed: number): void {
    this.speedLog.push({ time, speed });
    this.trimSpeedLog();
  }

  public findTimeAfterDistance = (startTime: number, distance: number) => {
    // sanity checks
    if (distance < 0) console.warn('findTimeAfterDistance: distance is negative');

    if (distance === 0) return startTime; // exit condition

    // Combine historical speed changes from speedLog with future speed changes from partQueue and return to default speed
    const allSpeedChanges: { time: number; speed: number }[] = [
      // Add historical speed changes from speedLog
      ...this.speedLog,
      // Add future speed changes from partQueue
      ...this.partQueue
        .filter((part) => part.conveyorSpeedTime > Date.now()) // Only include future speed changes
        .map((part) => ({
          time: part.conveyorSpeedTime,
          speed: part.conveyorSpeed,
        })),
      // Add return to default speed if it exists and is in the future
      ...(this.returnToDefaultConveyorSpeed
        ? [
            {
              time: this.returnToDefaultConveyorSpeed.time,
              speed: this.returnToDefaultConveyorSpeed.speed,
            },
          ]
        : []),
    ].sort((a, b) => a.time - b.time); // Sort by time

    // Determine the speed active at startTime
    const lastChangeBeforeStart = [...allSpeedChanges].filter((c) => c.time <= startTime).pop();
    let lastSpeed = lastChangeBeforeStart ? lastChangeBeforeStart.speed : this.speedManager.getCurrentSpeed();

    let remainingDistance = distance;
    let finishTime = startTime;
    let lastTime = startTime;

    // Iterate forward through changes after startTime, consuming distance
    for (let i = 0; i < allSpeedChanges.length && remainingDistance > 0; i++) {
      const { speed, time: changeTime } = allSpeedChanges[i];
      if (changeTime <= startTime) {
        // Keep updating lastSpeed for changes up to startTime
        lastSpeed = speed;
        continue;
      }

      // Time span at lastSpeed until the next change
      const timeTraveled = changeTime - lastTime;
      if (timeTraveled > 0) {
        const distanceTraveled = timeTraveled * lastSpeed;
        if (distanceTraveled >= remainingDistance) {
          finishTime += remainingDistance / lastSpeed;
          remainingDistance = 0;
          return finishTime;
        } else {
          finishTime += timeTraveled;
          remainingDistance -= distanceTraveled;
          lastTime = changeTime;
        }
      }

      // Apply the new speed after the change
      lastSpeed = speed;
    }

    // After processing all changes, continue at lastSpeed up to a reasonable bound
    if (remainingDistance > 0) {
      const maxHorizon = lastTime + 10 * 60 * 1000; // 10 minutes fallback horizon
      const timeTraveled = maxHorizon - lastTime;
      const distanceTraveled = timeTraveled * lastSpeed;
      if (distanceTraveled >= remainingDistance) {
        finishTime += remainingDistance / lastSpeed;
        remainingDistance = 0;
      } else {
        // If still not enough, return the horizon (should not happen under normal speeds)
        finishTime = maxHorizon;
        remainingDistance = 0;
      }
    }

    return finishTime;
  };

  public scheduleJetFire(jet: number, jetTime: number, part: Part): NodeJS.Timeout {
    const delay = jetTime - Date.now();
    return setTimeout(() => {
      this.deviceManager.sendCommand(DeviceName.CONVEYOR_JETS, ArduinoCommands.FIRE_JET, jet);
      this.markPartSorted(part.initialTime);
    }, delay);
  }

  private scheduleReturnToDefaultSpeed(jetTime: number): void {
    // Cancel existing return to default speed timer if it exists
    if (this.returnToDefaultConveyorSpeed) {
      clearTimeout(this.returnToDefaultConveyorSpeed.ref);
      this.returnToDefaultConveyorSpeed = null;
    }

    // Skip scheduling return to default speed in constant speed mode
    const settings = this.settingsManager.getSettings();
    if (settings && settings.constantConveyorSpeed) {
      return;
    }

    // Schedule new return to default speed timer
    const defaultSpeed = this.speedManager.getDefaultSpeed();

    const ref = this.speedManager.scheduleConveyorSpeedChange(defaultSpeed, jetTime, (time: number, speed: number) =>
      this.addSpeedToLog(time, speed),
    );
    this.returnToDefaultConveyorSpeed = { time: jetTime, speed: defaultSpeed, ref };
  }

  public insertPart(part: Part): void {
    // Find insertion index based on defaultArrivalTime
    let insertIndex = this.partQueue.findIndex((p) => p.defaultArrivalTime > part.defaultArrivalTime);
    const isInsertAtEnd = insertIndex === -1;
    insertIndex = insertIndex === -1 ? this.partQueue.length : insertIndex; // if no part found, insert at the end

    // Schedule and assign all part actions
    this.schedulePartActions(part);

    // Insert part at correct index
    this.partQueue.splice(insertIndex, 0, part);

    // if there is an arrival time delay, we need to slow down the part
    if (isInsertAtEnd) {
      // Reschedule return to default speed for the new last part
      this.scheduleReturnToDefaultSpeed(part.jetTime);
    } else if (part.arrivalTimeDelay > 0) {
      this.updateAllFutureParts(insertIndex);
    } else {
      this.updateNextPart(part.jetTime, insertIndex);
    }
  }

  private updateNextPart(nextPartSpeedTime: number, insertIndex: number): void {
    // Find next conveyor part
    const nextConveyorPart = this.partQueue[insertIndex + 1];
    if (nextConveyorPart) {
      // Cancel next part's conveyor speed ref
      if (nextConveyorPart.conveyorSpeedRef) {
        clearTimeout(nextConveyorPart.conveyorSpeedRef);
      }

      // Update next part's conveyor speed time
      nextConveyorPart.conveyorSpeedTime = nextPartSpeedTime;

      // Reschedule conveyor speed change only if not in constant speed mode
      const settings = this.settingsManager.getSettings();
      if (settings && !settings.constantConveyorSpeed) {
        nextConveyorPart.conveyorSpeedRef = this.speedManager.scheduleConveyorSpeedChange(
          nextConveyorPart.conveyorSpeed,
          nextConveyorPart.conveyorSpeedTime,
          (time: number, speed: number) => this.addSpeedToLog(time, speed),
        );
      }
    }
  }

  private updateAllFutureParts(insertIndex: number): void {
    // console.log('updateAllFutureParts =============================================');
    // const filteredPartQueue = this.partQueue.map((p) => {
    //   const { moveRef, jetRef, conveyorSpeedRef, ...rest } = p;
    //   return rest;
    // });
    // console.log(filteredPartQueue);
    // console.log(insertIndex);
    // console.log('===============================================================');
    // Prevent recursive recalculation
    // - there should be no recursive recalculation because the partQueue is sorted by defaultArrivalTime
    // - if there is a recursive recalculation, it is because of a bug
    if (this.isRecalculating) {
      console.error('\x1b[33mError: recursive recalculation\x1b[0m');
      return;
    }
    this.isRecalculating = true;

    try {
      // Find all parts that come after current part
      const partsToResort = this.partQueue.slice(insertIndex + 1);
      // Remove partsToResort from partQueue
      this.partQueue = this.partQueue.slice(0, insertIndex + 1);

      // Cancel all actions for parts to be resorted
      this.cancelPartActions(partsToResort);

      // Resort all removed parts
      partsToResort.forEach((p) => {
        // Recalculate timings for each part
        const recalculatedPart = this.buildPart({
          partId: p.partId,
          initialTime: p.initialTime,
          initialPosition: p.initialPosition,
          bin: p.bin,
          sorter: p.sorter,
        });
        // Insert the recalculated part
        this.insertPart(recalculatedPart);
      });
    } finally {
      this.isRecalculating = false;
    }
  }

  private schedulePartActions(part: Part): void {
    // Schedule move action
    part.moveRef = this.sorterManager.scheduleSorterMove(part.sorter, part.bin, part.moveTime);

    // Schedule jet action
    part.jetRef = this.scheduleJetFire(part.sorter, part.jetTime, part);

    // Schedule conveyor speed change only if not in constant speed mode
    const settings = this.settingsManager.getSettings();
    if (settings && !settings.constantConveyorSpeed) {
      part.conveyorSpeedRef = this.speedManager.scheduleConveyorSpeedChange(
        part.conveyorSpeed,
        part.conveyorSpeedTime,
        (time: number, speed: number) => this.addSpeedToLog(time, speed),
      );
    }
  }

  private cancelPartActions(parts: Part[]): void {
    parts.forEach((part) => {
      if (part.moveRef) clearTimeout(part.moveRef);
      if (part.jetRef) clearTimeout(part.jetRef);
      if (part.conveyorSpeedRef) clearTimeout(part.conveyorSpeedRef);
    });
  }

  public markPartSorted(initialTime: number): void {
    const partIndex = this.partQueue.findIndex((p) => p.initialTime === initialTime);
    if (partIndex !== -1) {
      const part = this.partQueue[partIndex];
      part.status = 'completed';
      this.socketManager.emitPartSorted(part);
      this.partQueue.splice(partIndex, 1);
    }
  }

  public filterQueue(): void {
    // keep last part to leave conveyor onward
    const lastRecentPartToLeaveConveyor = this.partQueue.find((p) => p.defaultArrivalTime < Date.now());
    if (lastRecentPartToLeaveConveyor) {
      this.partQueue = this.partQueue.slice(this.partQueue.indexOf(lastRecentPartToLeaveConveyor));
    }
  }

  public getPartQueue(): Part[] {
    return this.partQueue;
  }

  // --- Encoder Position Tracking Methods (Phase 2) ---

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
      console.log(`\x1b[32m[ENCODER] Jet queued: ${data}\x1b[0m`);
    } else if (data.startsWith('BS:')) {
      // Buffer status: BS:<count>,<capacity>
      console.log(`\x1b[32m[ENCODER] Buffer status: ${data}\x1b[0m`);
    } else if (data.startsWith('ER:')) {
      // Encoder reset confirmation: ER:0
      console.log(`\x1b[32m[ENCODER] Encoder reset confirmed: ${data}\x1b[0m`);
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

    // Check if encoder scheduling is enabled
    const settings = this.settingsManager.getSettings();
    if (!settings?.useEncoderScheduling) {
      return;
    }

    // Find the part in the encoder queue that matches this jet and hasn't been sorted yet
    const part = this.encoderPartQueue.find((p) => p.jet === jet && p.status !== 'sorted');

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
    // Only process if encoder scheduling is enabled
    const settings = this.settingsManager.getSettings();
    if (!settings?.useEncoderScheduling) {
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
