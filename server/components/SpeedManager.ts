import { BaseComponent, ComponentConfig, ComponentStatus } from './BaseComponent';
import { DeviceManager } from './DeviceManager';
import { SocketManager } from './SocketManager';
import { SettingsManager } from './SettingsManager';
import { ArduinoCommands } from '../../types/arduinoCommands.type';
import { DeviceName } from '../../types/deviceName.type';

export interface SpeedManagerConfig extends ComponentConfig {
  deviceManager: DeviceManager;
  socketManager: SocketManager;
  settingsManager: SettingsManager;
}

export class SpeedManager extends BaseComponent {
  private deviceManager: DeviceManager;
  private socketManager: SocketManager;
  private settingsManager: SettingsManager;

  // Speed in pixels per millisecond - used for position calculations and frontend
  private defaultSpeed: number = 0;
  // Current speed in pixels per millisecond
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

      // Initialize from settings - conveyorSpeed is in pixels per millisecond
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

  public scheduleConveyorSpeedChange(
    // speed: pixels per millisecond - used for position calculations and frontend
    speed: number,
    atTime: number,
    onSpeedChange: (time: number, speed: number) => void,
  ): NodeJS.Timeout {
    const settings = this.settingsManager.getSettings();
    if (!settings) {
      throw new Error('Settings not available');
    }

    const minSpeedPercent = settings.minConveyorRPM / settings.maxConveyorRPM;
    if (speed < minSpeedPercent * this.defaultSpeed || speed > this.defaultSpeed) {
      console.error(`\x1b[33mscheduleConveyorSpeedChange: speed ${speed} is out of range\x1b[0m`);
    }

    // Convert from pixels per millisecond to RPM for Arduino control
    // This is the only place where we convert between the two speed types
    const rpm_speed = Math.round((speed / this.defaultSpeed) * settings.maxConveyorRPM);
    console.log('calculated rpm_speed:', rpm_speed);

    return setTimeout(() => {
      // Send RPM speed to Arduino
      this.deviceManager.sendCommand(DeviceName.CONVEYOR_JETS, ArduinoCommands.CONVEYOR_SPEED, rpm_speed);
      // Store pixels per millisecond speed for internal use
      this.currentSpeed = speed;
      // Send pixels per millisecond speed to frontend for position calculations
      this.socketManager.emitConveyorSpeedUpdate(speed);
      onSpeedChange(Date.now(), speed);

      // Calculate and update hopper feeder pause time based on conveyor speed
      const speedRatio = settings.conveyorSpeed / speed;
      const newPauseTime = Math.round(settings.feederPauseTime * speedRatio);
      this.deviceManager.updateFeederPauseTime(newPauseTime);
    }, atTime - Date.now());
  }

  protected notifyStatusChange(): void {
    this.socketManager.emitComponentStatusUpdate(this.getName(), this.getStatus(), this.getError());
  }
}
