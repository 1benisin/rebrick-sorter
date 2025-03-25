import { BaseComponent, ComponentConfig, ComponentStatus } from './BaseComponent';
import { DeviceManager } from './DeviceManager';
import { SocketManager } from './SocketManager';
import { ArduinoCommands } from '../../types/arduinoCommands.type';
import { Part } from '../../types/hardwareTypes.d';
import { SettingsManager } from './SettingsManager';
import { SpeedManager } from './SpeedManager';
import { SorterManager } from './SorterManager';
import { DeviceName } from '../../types/deviceName.type';

export const MIN_SLOWDOWN_PERCENT = 0.5; // Minimum speed percentage before skipping a part
export interface ConveyorManagerConfig extends ComponentConfig {
  deviceManager: DeviceManager;
  socketManager: SocketManager;
  settingsManager: SettingsManager;
  speedManager: SpeedManager;
  sorterManager: SorterManager;
}

export class ConveyorManager extends BaseComponent {
  private deviceManager: DeviceManager;
  private socketManager: SocketManager;
  private settingsManager: SettingsManager;
  private speedManager: SpeedManager;
  private sorterManager: SorterManager;

  private sorterCount: number = 0;
  private jetPositionsStart: number[] = [];
  private jetPositionsEnd: number[] = [];
  private partQueue: Part[] = [];

  constructor(config: ConveyorManagerConfig) {
    super('ConveyorManager');
    this.deviceManager = config.deviceManager;
    this.socketManager = config.socketManager;
    this.settingsManager = config.settingsManager;
    this.speedManager = config.speedManager;
    this.sorterManager = config.sorterManager;
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

  // find the timestamp when part has traveled a certain distance
  public findTimeAfterDistance = (startTime: number, distance: number) => {
    // sanity checks
    if (distance < 0) console.warn('findTimeAfterDistance: distance is negative');

    if (distance === 0) return startTime; // exit condition

    // If no parts in queue, use default speed for calculation
    if (this.partQueue.length === 0) {
      const defaultSpeed = this.speedManager.getDefaultSpeed();
      const timeNeeded = distance / defaultSpeed;
      return startTime + timeNeeded;
    }

    let remainingDistance = distance;
    let finishTime = startTime;

    // for each part and index in queue
    // this assumes that the partQueue is sorted by defaultArrivalTime
    for (let i = 0; i < this.partQueue.length; i++) {
      // exit condition
      if (remainingDistance <= 1) break;

      const { conveyorSpeed: speed, jetTime: speedStart } = this.partQueue[i];
      let { jetTime: speedEnd } = this.partQueue[i + 1] || {};

      // if no next speed change use 10 minutes from start as the end time
      speedEnd = speedEnd || speedStart + 10 * 60 * 1000;

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
    // find the index to insert the part in the partQueue based on defaultArrivalTime
    const curPartInsertIndex = this.partQueue.findIndex((p) => p.defaultArrivalTime > part.defaultArrivalTime); // returns -1 if not found or empty
    // get the previous parts speed change
    const prevConveyorSpeed =
      this.partQueue[curPartInsertIndex - 1]?.conveyorSpeed || this.speedManager.getDefaultSpeed();
    // schedule all part actions
    part.moveRef = this.sorterManager.scheduleSorterMove(part.sorter, part.bin, part.moveTime);
    part.jetRef = this.scheduleJetFire(part.sorter, part.jetTime, part);
    part.conveyorSpeed = prevConveyorSpeed;
    part.conveyorSpeedRef = this.speedManager.scheduleConveyorSpeedChange(prevConveyorSpeed, part.jetTime);

    // insert the part into the partQueue
    this.partQueue.splice(curPartInsertIndex, 0, part);

    // if part requires a slowdown delay
    if (part.arrivalTimeDelay > 0) {
      // find previous sorter part or just furthest part on conveyor
      const startSlowdownIndex = this.partQueue.reduce((acc, p, i) => {
        if (p.sorter === part.sorter) return i;
        return acc;
      }, 0);

      const startOfSlowdown = this.partQueue[startSlowdownIndex].jetTime || Date.now();
      const endOfSlowdown = part.jetTime;

      // calculate slowdown percent
      const slowdownPercent = this.speedManager.computeSlowDownPercent({
        startOfSlowdown,
        targetArrivalTime: part.jetTime,
        arrivalTimeDelay: part.arrivalTimeDelay,
      });

      // update first part in slowdown. just needs conveyor speed changed
      const firstPart = this.partQueue[startSlowdownIndex];
      if (firstPart.conveyorSpeedRef) clearTimeout(firstPart.conveyorSpeedRef);
      firstPart.conveyorSpeed = firstPart.conveyorSpeed * slowdownPercent;
      firstPart.conveyorSpeedRef = this.speedManager.scheduleConveyorSpeedChange(
        firstPart.conveyorSpeed,
        firstPart.jetTime,
      );
      this.partQueue[startSlowdownIndex] = firstPart;

      // update parts between startSlowdownIndex and curPartInsertIndex
      for (let i = startSlowdownIndex + 1; i < curPartInsertIndex; i++) {
        const p = this.partQueue[i];

        // calculate the fraction of the slowdown that has passed
        const fractionOfSlowdown = (p.jetTime - startOfSlowdown) / (endOfSlowdown - startOfSlowdown);
        // calculate the delay by which to adjust the part actions
        const delayBy = fractionOfSlowdown * part.arrivalTimeDelay;
        // adjust part values
        p.moveTime += delayBy;
        p.moveFinishedTime += delayBy;
        p.jetTime += delayBy;
        p.conveyorSpeed = p.conveyorSpeed * slowdownPercent;
        // cancel any existing part actions
        if (p.moveRef) clearTimeout(p.moveRef);
        if (p.jetRef) clearTimeout(p.jetRef);
        if (p.conveyorSpeedRef) clearTimeout(p.conveyorSpeedRef);
        // reschedule the part actions
        p.moveRef = this.sorterManager.scheduleSorterMove(p.sorter, p.bin, p.moveTime);
        p.jetRef = this.scheduleJetFire(p.sorter, p.jetTime, p);
        p.conveyorSpeedRef = this.speedManager.scheduleConveyorSpeedChange(p.conveyorSpeed, p.jetTime);

        // update the part in the partQueue
        this.partQueue[i] = p;
      }

      // Then update parts after curPartInsertIndex with full delay
      for (let i = curPartInsertIndex + 1; i < this.partQueue.length; i++) {
        const p = this.partQueue[i];

        // adjust part values with full delay
        p.moveTime += part.arrivalTimeDelay;
        p.moveFinishedTime += part.arrivalTimeDelay;
        p.jetTime += part.arrivalTimeDelay;
        // cancel any existing part actions
        if (p.moveRef) clearTimeout(p.moveRef);
        if (p.jetRef) clearTimeout(p.jetRef);
        if (p.conveyorSpeedRef) clearTimeout(p.conveyorSpeedRef);
        // reschedule the part actions
        p.moveRef = this.sorterManager.scheduleSorterMove(p.sorter, p.bin, p.moveTime);
        p.jetRef = this.scheduleJetFire(p.sorter, p.jetTime, p);
        p.conveyorSpeedRef = this.speedManager.scheduleConveyorSpeedChange(p.conveyorSpeed, p.jetTime);

        // update the part in the partQueue
        this.partQueue[i] = p;
      }
    }

    // Limit queue to 50 parts
    this.partQueue = this.partQueue.slice(-50);
  }

  public markPartSorted(initialTime: number): void {
    const partIndex = this.partQueue.findIndex((p) => p.initialTime === initialTime);
    if (partIndex !== -1) {
      const part = this.partQueue[partIndex];
      part.status = 'completed';
      this.socketManager.emitPartSorted(part);
      this.partQueue[partIndex] = part;
    }
  }

  public filterQueue(): void {
    // -- filter partQueue
    let lastSorterPartIndexes = new Array(this.sorterCount).fill(0);
    let lastPartJettedIndex = 0;

    // get index of last part for each sorter
    // and index of last part jetted
    this.partQueue.forEach((p, i) => {
      lastSorterPartIndexes[p.sorter] = i;
      if (p.jetTime < Date.now() && p.jetTime > this.partQueue[lastPartJettedIndex].jetTime) lastPartJettedIndex = i;
    });

    // slice partQueue to keep all parts that haven't been jetted yet
    // and to keep at least one part for each sorter
    const sliceIndex = Math.min(...lastSorterPartIndexes, lastPartJettedIndex);
    this.partQueue = this.partQueue.slice(sliceIndex);
  }

  public getPartQueue(): Part[] {
    return this.partQueue;
  }

  protected notifyStatusChange(): void {
    this.socketManager.emitComponentStatusUpdate(this.getName(), this.getStatus(), this.getError());
  }
}
