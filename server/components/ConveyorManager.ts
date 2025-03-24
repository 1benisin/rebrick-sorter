import { BaseComponent, ComponentConfig, ComponentStatus } from './BaseComponent';
import { DeviceManager } from './DeviceManager';
import { SocketManager } from './SocketManager';
import { ArduinoCommands } from '../../types/arduinoCommands.type';
import { Part } from '../../types/hardwareTypes.d';
import { SettingsManager } from './SettingsManager';
import { DeviceName } from '../../types/deviceName.type';

export interface ConveyorManagerConfig extends ComponentConfig {
  deviceManager: DeviceManager;
  socketManager: SocketManager;
  settingsManager: SettingsManager;
}

export class ConveyorManager extends BaseComponent {
  private deviceManager: DeviceManager;
  private socketManager: SocketManager;
  private settingsManager: SettingsManager;
  private defaultSpeed: number = 0;
  private currentSpeed: number = 0;
  private sorterCount: number = 0;
  private jetPositionsStart: number[] = [];
  private jetPositionsEnd: number[] = [];
  private partQueue: Part[] = [];

  constructor(config: ConveyorManagerConfig) {
    super('ConveyorManager');
    this.deviceManager = config.deviceManager;
    this.socketManager = config.socketManager;
    this.settingsManager = config.settingsManager;
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
      this.defaultSpeed = settings.conveyorSpeed;
      this.currentSpeed = this.defaultSpeed;
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
    this.partQueue = [];
    this.currentSpeed = 0;
    this.setStatus(ComponentStatus.UNINITIALIZED);
  }

  public toggleConveyor(): void {
    this.deviceManager.sendCommand(DeviceName.CONVEYOR_JETS, ArduinoCommands.CONVEYOR_ON_OFF);
  }

  public setSpeed(speed: number): void {
    if (speed === this.currentSpeed) return;

    this.currentSpeed = speed;
    this.deviceManager.sendCommand(DeviceName.CONVEYOR_JETS, ArduinoCommands.CONVEYOR_SPEED, Math.round(speed));
    this.socketManager.emitConveyorSpeedUpdate(speed);
  }

  public getCurrentSpeed(): number {
    return this.currentSpeed;
  }

  public getJetPosition(sorter: number): number {
    return (this.jetPositionsStart[sorter] + this.jetPositionsEnd[sorter]) / 2;
  }

  public addPart(part: Part): void {
    this.partQueue.push(part);
    // Limit queue to 40 parts
    this.partQueue = this.partQueue.slice(-40);
  }

  public findPreviousPart(sorter: number): Part | null {
    return this.partQueue.reduce<Part | null>((acc, p) => {
      if (p.sorter === sorter) return p;
      return acc;
    }, null);
  }

  public markPartSorted(partId: string): void {
    const part = this.partQueue.find((p) => p.partId === partId);
    if (part) {
      part.status = 'completed';
      this.socketManager.emitPartSorted(partId);
    }
  }

  public scheduleJetFire(sorter: number, jetTime: number): void {
    const now = Date.now();
    const delay = jetTime - now;

    if (delay <= 0) {
      console.log('JET FIRE: jetTime is in the past');
      return;
    }

    setTimeout(() => {
      this.deviceManager.sendCommand(DeviceName.CONVEYOR_JETS, 'j', sorter);
    }, delay);
  }

  protected notifyStatusChange(): void {
    this.socketManager.emitComponentStatusUpdate(this.getName(), this.getStatus(), this.getError());
  }
}
