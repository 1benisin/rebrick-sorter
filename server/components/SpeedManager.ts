import { BaseComponent, ComponentConfig, ComponentStatus } from './BaseComponent';
import { DeviceManager } from './DeviceManager';
import { SocketManager } from './SocketManager';
import { SettingsManager } from './SettingsManager';
import { ArduinoCommands } from '../../types/arduinoCommands.type';
import { DeviceName } from '../../types/deviceName.type';
import { MIN_SLOWDOWN_PERCENT } from './ConveyorManager';

const DEFAULT_CONVEYOR_RPM = 60; // 60 rpm is the maximum speed for the conveyor motor
export interface SpeedManagerConfig extends ComponentConfig {
  deviceManager: DeviceManager;
  socketManager: SocketManager;
  settingsManager: SettingsManager;
}

export class SpeedManager extends BaseComponent {
  private deviceManager: DeviceManager;
  private socketManager: SocketManager;
  private settingsManager: SettingsManager;

  private defaultSpeed: number = 0;
  private currentSpeed: number = 0;

  constructor(config: SpeedManagerConfig) {
    super('SpeedManager');
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

      // Register for settings updates
      this.settingsManager.registerSettingsUpdateCallback(this.reinitialize.bind(this));

      this.setStatus(ComponentStatus.READY);
    } catch (error) {
      this.setError(error instanceof Error ? error.message : 'Unknown error initializing speed manager');
    }
  }

  public async reinitialize(): Promise<void> {
    await this.deinitialize();
    await this.initialize();
  }

  public async deinitialize(): Promise<void> {
    // Unregister settings callback
    this.settingsManager.unregisterSettingsUpdateCallback(this.reinitialize.bind(this));
    this.defaultSpeed = 0;
    this.currentSpeed = 0;
    this.setStatus(ComponentStatus.UNINITIALIZED);
  }

  public getDefaultSpeed(): number {
    return this.defaultSpeed;
  }

  public getCurrentSpeed(): number {
    return this.currentSpeed;
  }

  public computeSlowDownPercent(params: {
    startOfSlowdown: number;
    targetArrivalTime: number;
    arrivalTimeDelay: number;
  }): number {
    let { startOfSlowdown, targetArrivalTime, arrivalTimeDelay } = params;

    // find updated move and jet times
    const oldArrivalTime = targetArrivalTime - arrivalTimeDelay;

    // startOfSlowdown = Math.max(startOfSlowdown, Date.now());

    // find new speed percent
    const tooSmallTimeDif = oldArrivalTime - startOfSlowdown;
    const targetTimeDif = targetArrivalTime - startOfSlowdown;

    const speedPercent = tooSmallTimeDif / targetTimeDif;

    if (speedPercent < 0.5) {
      console.log('==========================================');
      console.log('speedPercent TOO SMALL:');
      console.log('computed speedPercent:', speedPercent);
      console.log('tooSmallTimeDif:', tooSmallTimeDif);
      console.log('targetTimeDif:', targetTimeDif);
      console.log('oldArrivalTime:', oldArrivalTime);
      console.log('startOfSlowdown:', startOfSlowdown);
      console.log('targetArrivalTime:', targetArrivalTime);
      console.log('arrivalTimeDelay:', arrivalTimeDelay);
      console.log('==========================================');
    }
    return speedPercent;
  }

  public scheduleConveyorSpeedChange(speed: number, atTime: number): NodeJS.Timeout {
    if (speed < MIN_SLOWDOWN_PERCENT * this.defaultSpeed || speed > this.defaultSpeed) {
      console.error(`\x1b[33mscheduleConveyorSpeedChange: speed ${speed} is out of range\x1b[0m`);
    }

    // normalize speed from pixels per millisecond to conveyor motor rpm 0-60 for arduino
    const rpm_speed = Math.round((speed / this.defaultSpeed) * DEFAULT_CONVEYOR_RPM);
    console.log('calculated rpm_speed:', rpm_speed);

    return setTimeout(() => {
      this.deviceManager.sendCommand(DeviceName.CONVEYOR_JETS, ArduinoCommands.CONVEYOR_SPEED, rpm_speed);
      this.currentSpeed = speed;
      this.socketManager.emitConveyorSpeedUpdate(rpm_speed);
    }, atTime - Date.now());
  }

  protected notifyStatusChange(): void {
    this.socketManager.emitComponentStatusUpdate(this.getName(), this.getStatus(), this.getError());
  }
}
