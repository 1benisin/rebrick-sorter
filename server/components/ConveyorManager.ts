import { BaseComponent, ComponentConfig, ComponentStatus } from './BaseComponent';
import { DeviceManager } from './DeviceManager';
import { SocketManager } from './SocketManager';
import { ArduinoCommands } from '../../types/arduinoCommands.type';
import { Part } from '../../types/part.type';
import { SettingsManager } from './SettingsManager';
import { SpeedManager } from './SpeedManager';
import { SorterManager } from './SorterManager';
import { DeviceName } from '../../types/deviceName.type';
import { SortPartDto } from '../../types/sortPart.dto';

export const MIN_SLOWDOWN_PERCENT = 0.5; // Minimum speed percentage before skipping a part
export interface ConveyorManagerConfig extends ComponentConfig {
  deviceManager: DeviceManager;
  socketManager: SocketManager;
  settingsManager: SettingsManager;
  speedManager: SpeedManager;
  sorterManager: SorterManager;
  buildPart: (part: SortPartDto) => Part;
}

export class ConveyorManager extends BaseComponent {
  private deviceManager: DeviceManager;
  private socketManager: SocketManager;
  private settingsManager: SettingsManager;
  private speedManager: SpeedManager;
  private sorterManager: SorterManager;
  private buildPart: (part: SortPartDto) => Part;

  private sorterCount: number = 0;
  private jetPositionsStart: number[] = [];
  private jetPositionsEnd: number[] = [];
  private partQueue: Part[] = [];
  private speedLog: { time: number; speed: number }[] = [];
  private isRecalculating: boolean = false;

  constructor(config: ConveyorManagerConfig) {
    super('ConveyorManager');
    this.deviceManager = config.deviceManager;
    this.socketManager = config.socketManager;
    this.settingsManager = config.settingsManager;
    this.speedManager = config.speedManager;
    this.sorterManager = config.sorterManager;
    this.buildPart = config.buildPart;
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
      this.sorterCount = settings.sorters.length;
      this.jetPositionsStart = settings.sorters.map((sorter) => sorter.jetPositionStart);
      this.jetPositionsEnd = settings.sorters.map((sorter) => sorter.jetPositionEnd);
      this.partQueue = [];
      this.speedLog = [];

      // Register for settings updates
      this.settingsManager.registerSettingsUpdateCallback(this.reinitialize.bind(this));

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
    // Unregister settings callback
    this.settingsManager.unregisterSettingsUpdateCallback(this.reinitialize.bind(this));
    // clear all part actions
    this.partQueue.forEach((part) => {
      if (part.moveRef) clearTimeout(part.moveRef);
      if (part.jetRef) clearTimeout(part.jetRef);
      if (part.conveyorSpeedRef) clearTimeout(part.conveyorSpeedRef);
    });
    this.partQueue = [];
    this.speedLog = [];

    this.setStatus(ComponentStatus.UNINITIALIZED);
  }

  public toggleConveyor(): void {
    this.deviceManager.sendCommand(DeviceName.CONVEYOR_JETS, ArduinoCommands.CONVEYOR_ON_OFF);
  }

  public getCurrentSpeed(): number {
    return this.speedManager.getCurrentSpeed();
  }

  public getJetPosition(sorter: number): number {
    return (this.jetPositionsStart[sorter] + this.jetPositionsEnd[sorter]) / 2;
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

  public addSpeedToLog(time: number, speed: number): void {
    this.speedLog.push({ time, speed });
  }

  public findTimeAfterDistance = (startTime: number, distance: number) => {
    // sanity checks
    if (distance < 0) console.warn('findTimeAfterDistance: distance is negative');

    if (distance === 0) return startTime; // exit condition

    // Combine historical speed changes from speedLog with future speed changes from partQueue
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
    ].sort((a, b) => a.time - b.time); // Sort by time

    // If no speed changes, use current speed
    if (allSpeedChanges.length === 0) {
      const currentSpeed = this.speedManager.getCurrentSpeed();
      const travelTime = distance / currentSpeed;
      return startTime + travelTime;
    }
    let remainingDistance = distance;
    let finishTime = startTime;

    // Calculate time based on all speed changes
    for (let i = 0; i < allSpeedChanges.length; i++) {
      if (remainingDistance <= 1) break;

      const { speed, time: speedStart } = allSpeedChanges[i];
      // if no next speed change use 10 minutes from start as the end time
      const speedEnd = allSpeedChanges[i + 1]?.time || speedStart + 10 * 60 * 1000;

      // use later start time
      const start = speedStart > startTime ? speedStart : startTime;

      let timeTraveled = speedEnd - start;

      // if speed ended before the start time of the part timeTraveled will be negative
      // -clamp the time traveled to 0 because it has no effect on the position
      timeTraveled = timeTraveled < 0 ? 0 : timeTraveled;
      let distanceTraveled = timeTraveled * speed;

      if (distanceTraveled > remainingDistance) {
        distanceTraveled = remainingDistance;
        timeTraveled = distanceTraveled / speed;
      }

      finishTime += timeTraveled;
      remainingDistance -= distanceTraveled;
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

  public insertPart(part: Part): void {
    // Find insertion index based on defaultArrivalTime
    let insertIndex = this.partQueue.findIndex((p) => p.defaultArrivalTime > part.defaultArrivalTime);
    insertIndex = insertIndex === -1 ? this.partQueue.length : insertIndex; // if no part found, insert at the end

    // Schedule and assign all part actions
    this.schedulePartActions(part);

    // Insert part at correct index
    this.partQueue.splice(insertIndex, 0, part);

    // if there is an arrival time delay, we need to slow down the part
    if (part.arrivalTimeDelay > 0) {
      this.updateAllFutureParts(insertIndex);
    } else {
      this.updateNextPart(part.jetTime, insertIndex);
    }
  }

  private updateNextPart(nextPartSpeedTime: number, insertIndex: number): void {
    // Find next conveyor part
    const nextConveyorPart = this.partQueue[insertIndex];
    if (nextConveyorPart) {
      // Cancel next part's conveyor speed ref
      if (nextConveyorPart.conveyorSpeedRef) {
        clearTimeout(nextConveyorPart.conveyorSpeedRef);
      }
      // Update next part's conveyor speed time
      nextConveyorPart.conveyorSpeedTime = nextPartSpeedTime;
      // Reschedule conveyor speed change
      nextConveyorPart.conveyorSpeedRef = this.speedManager.scheduleConveyorSpeedChange(
        nextConveyorPart.conveyorSpeed,
        nextConveyorPart.conveyorSpeedTime,
        (time: number, speed: number) => this.addSpeedToLog(time, speed),
      );
    }
  }

  private updateAllFutureParts(insertIndex: number): void {
    console.log('updateAllFutureParts =============================================');
    const filteredPartQueue = this.partQueue.map((p) => {
      const { moveRef, jetRef, conveyorSpeedRef, ...rest } = p;
      return rest;
    });
    console.log(filteredPartQueue);
    console.log(insertIndex);
    console.log('===============================================================');
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

    // Schedule conveyor speed change
    part.conveyorSpeedRef = this.speedManager.scheduleConveyorSpeedChange(
      part.conveyorSpeed,
      part.conveyorSpeedTime,
      (time: number, speed: number) => this.addSpeedToLog(time, speed),
    );
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
    // only keep 'pending' parts
    this.partQueue = this.partQueue.filter((p) => p.status === 'pending');
  }

  public getPartQueue(): Part[] {
    return this.partQueue;
  }

  protected notifyStatusChange(): void {
    this.socketManager.emitComponentStatusUpdate(this.getName(), this.getStatus(), this.getError());
  }
}
