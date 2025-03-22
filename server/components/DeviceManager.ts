import { BaseComponent, ComponentConfig, ComponentStatus } from './BaseComponent';
import { ArduinoConfig } from './arduinoConfig.type';
import { SerialPort, ReadlineParser, SerialPortMock } from 'serialport';
import { SocketManager } from './SocketManager';
import { SettingsType } from '../../types/settings.type';
import { SettingsManager } from './SettingsManager';

export interface DeviceManagerConfig extends ComponentConfig {
  socketManager: SocketManager;
  settingsManager: SettingsManager;
}

export class DeviceManager extends BaseComponent {
  private devices: Map<string, SerialPort | SerialPortMock> = new Map();
  private deviceConfigs: Map<string, ArduinoConfig> = new Map();
  private socketManager: SocketManager;
  private settingsManager: SettingsManager;

  constructor(config: DeviceManagerConfig) {
    super('DeviceManager');
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

      // Connect to devices based on settings
      if (settings.conveyorJetsSerialPort) {
        await this.connectDevice(settings.conveyorJetsSerialPort, {
          deviceType: 'conveyor_jets',
          JET_START_POSITIONS: settings.sorters.map((sorter) => sorter.jetPositionStart),
          JET_END_POSITIONS: settings.sorters.map((sorter) => sorter.jetPositionEnd),
        });
      }

      if (settings.hopperFeederSerialPort) {
        await this.connectDevice(settings.hopperFeederSerialPort, {
          deviceType: 'hopper_feeder',
          HOPPER_ACTION_INTERVAL: 1000,
          MOTOR_SPEED: 100,
          DELAY_STOPPING_INTERVAL: 100,
          PAUSE_INTERVAL: 100,
          SHORT_MOVE_INTERVAL: 100,
        });
      }

      // Connect to sorters
      for (const sorter of settings.sorters) {
        await this.connectDevice(sorter.serialPort, {
          deviceType: 'sorter',
          GRID_DIMENSION: sorter.gridDimension,
          X_OFFSET: sorter.xOffset,
          Y_OFFSET: sorter.yOffset,
          X_STEPS_TO_LAST: sorter.xStepsToLast,
          Y_STEPS_TO_LAST: sorter.yStepsToLast,
          ACCELERATION: sorter.acceleration,
          HOMING_SPEED: sorter.homingSpeed,
          SPEED: sorter.speed,
          ROW_MAJOR_ORDER: sorter.rowMajorOrder,
        });
      }

      this.setStatus(ComponentStatus.READY);
    } catch (error) {
      this.setError(error instanceof Error ? error.message : 'Unknown error initializing device manager');
    }
  }

  public async reinitialize(): Promise<void> {
    await this.deinitialize();
    await this.initialize();
  }

  public async deinitialize(): Promise<void> {
    // Unregister settings callback
    this.settingsManager.unregisterSettingsUpdateCallback(this.reinitialize.bind(this));

    for (const [path, device] of this.devices) {
      try {
        await new Promise<void>((resolve, reject) => {
          device.close((err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      } catch (error) {
        console.error(`Error closing device ${path}:`, error);
      }
    }
    this.devices.clear();
    this.deviceConfigs.clear();
    this.setStatus(ComponentStatus.UNINITIALIZED);
  }

  public async connectDevice(path: string, config: ArduinoConfig): Promise<void> {
    try {
      // Disconnect if already connected
      if (this.devices.has(path)) {
        await this.disconnectDevice(path);
      }

      const device = await this.createDevice(path, config);
      this.devices.set(path, device);
      this.deviceConfigs.set(path, config);
      this.socketManager.emitComponentStatusUpdate(path, ComponentStatus.READY, null);
    } catch (error) {
      this.socketManager.emitComponentStatusUpdate(
        path,
        ComponentStatus.ERROR,
        error instanceof Error ? error.message : 'Unknown error',
      );
      throw error;
    }
  }

  public async disconnectDevice(path: string): Promise<void> {
    const device = this.devices.get(path);
    if (device) {
      await new Promise<void>((resolve, reject) => {
        device.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      this.devices.delete(path);
      this.deviceConfigs.delete(path);
      this.socketManager.emitComponentStatusUpdate(path, ComponentStatus.UNINITIALIZED, null);
    }
  }

  private async createDevice(path: string, config: ArduinoConfig): Promise<SerialPort | SerialPortMock> {
    const device =
      process.env.NEXT_PUBLIC_ENVIRONMENT === 'Development'
        ? new SerialPortMock({ path, baudRate: 9600 })
        : new SerialPort({ path, baudRate: 9600 });

    await new Promise<void>((resolve, reject) => {
      device.open((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Set up the parser to process incoming data
    const parser = device.pipe(new ReadlineParser({ delimiter: '\r\n' }));
    parser.on('data', (data) => this.handleDeviceData(path, data));

    return device;
  }

  private buildSorterInitMessage(config: ArduinoConfig): string {
    if (config.deviceType !== 'sorter') return '';
    const configValues = [
      config.GRID_DIMENSION,
      config.X_OFFSET,
      config.Y_OFFSET,
      config.X_STEPS_TO_LAST,
      config.Y_STEPS_TO_LAST,
      config.ACCELERATION,
      config.HOMING_SPEED,
      config.SPEED,
      config.ROW_MAJOR_ORDER ? 1 : 0,
    ];
    return 's,' + configValues.join(',');
  }

  private buildConveyorJetsInitMessage(config: ArduinoConfig): string {
    if (config.deviceType !== 'conveyor_jets') return '';
    const jetFireTimes = config.JET_END_POSITIONS.map((end, index) => end - config.JET_START_POSITIONS[index]);
    return 's,' + jetFireTimes.join(',');
  }

  private buildHopperFeederInitMessage(config: ArduinoConfig): string {
    if (config.deviceType !== 'hopper_feeder') return '';
    const configValues = [
      config.HOPPER_ACTION_INTERVAL,
      config.MOTOR_SPEED,
      config.DELAY_STOPPING_INTERVAL,
      config.PAUSE_INTERVAL,
      config.SHORT_MOVE_INTERVAL,
    ];
    return 's,' + configValues.join(',');
  }

  private handleDeviceData(path: string, data: string): void {
    console.log(`Data received from ${path}:`, data);
    if (data.includes('Ready')) {
      const config = this.deviceConfigs.get(path);
      if (!config) {
        console.error(`No config found for device ${path}`);
        return;
      }

      let configMessage = '';
      switch (config.deviceType) {
        case 'sorter':
          configMessage = this.buildSorterInitMessage(config);
          break;
        case 'conveyor_jets':
          configMessage = this.buildConveyorJetsInitMessage(config);
          break;
        case 'hopper_feeder':
          configMessage = this.buildHopperFeederInitMessage(config);
          break;
      }

      if (configMessage) {
        this.sendCommand(path, configMessage);
      }

      this.socketManager.emitComponentStatusUpdate(path, ComponentStatus.READY, null);
    }
  }

  public sendCommand(path: string, command: string, data?: number): void {
    const device = this.devices.get(path);
    if (!device) {
      throw new Error(`Device ${path} not found`);
    }

    const message = data !== undefined ? `${command}${data}` : command;
    const formattedMessage = `<${message}>`;

    device.write(formattedMessage, (err) => {
      if (err) {
        console.error(`Error sending message to ${path}:`, err);
        this.socketManager.emitComponentStatusUpdate(path, ComponentStatus.ERROR, err.message);
      }
    });
  }

  protected notifyStatusChange(): void {
    this.socketManager.emitComponentStatusUpdate(this.getName(), this.getStatus(), this.getError());
  }
}
