import { BaseComponent, ComponentConfig, ComponentStatus } from './BaseComponent';
import { ArduinoConfig } from './arduinoConfig.type';
import { SerialPort, ReadlineParser, SerialPortMock } from 'serialport';
import { SocketManager } from './SocketManager';
import { SettingsManager } from './SettingsManager';
import { DeviceName, DeviceInfo } from '../../types/deviceName.type';

export interface DeviceManagerConfig extends ComponentConfig {
  socketManager: SocketManager;
  settingsManager: SettingsManager;
}

export class DeviceManager extends BaseComponent {
  private devices: Map<DeviceName, DeviceInfo> = new Map();
  private socketManager: SocketManager;
  private settingsManager: SettingsManager;

  constructor(config: DeviceManagerConfig) {
    super('DeviceManager');
    this.socketManager = config.socketManager;
    this.settingsManager = config.settingsManager;
  }

  public async initialize(): Promise<void> {
    try {
      console.log('DeviceManager: Starting initialization...');
      this.setStatus(ComponentStatus.INITIALIZING);

      // Get settings from SettingsManager
      const settings = this.settingsManager.getSettings();
      if (!settings) {
        throw new Error('Settings not available');
      }

      // Connect to devices based on settings
      if (settings.conveyorJetsSerialPort) {
        await this.connectDevice(DeviceName.CONVEYOR_JETS, settings.conveyorJetsSerialPort, {
          deviceType: 'conveyor_jets',
          JET_START_POSITIONS: settings.sorters.map((sorter) => sorter.jetPositionStart),
          JET_END_POSITIONS: settings.sorters.map((sorter) => sorter.jetPositionEnd),
        });
      }

      if (settings.hopperFeederSerialPort) {
        try {
          await this.connectDevice(DeviceName.HOPPER_FEEDER, settings.hopperFeederSerialPort, {
            deviceType: 'hopper_feeder',
            HOPPER_ACTION_INTERVAL: 20000,
            MOTOR_SPEED: 200,
            DELAY_STOPPING_INTERVAL: 5,
            PAUSE_INTERVAL: 1000,
            SHORT_MOVE_INTERVAL: 250,
          });
        } catch (error) {
          console.error('\x1b[33mFailed to connect to hopper feeder device:\x1b[0m', error);
        }
      }

      // Connect to sorters
      for (let i = 0; i < settings.sorters.length; i++) {
        const sorter = settings.sorters[i];
        const deviceName = DeviceName[`SORTER_${i}` as keyof typeof DeviceName];
        try {
          await this.connectDevice(deviceName, sorter.serialPort, {
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
        } catch (error) {
          console.error(`\x1b[33mFailed to connect to sorter ${deviceName} at ${sorter.serialPort}:\x1b[0m`, error);
          // Continue with other sorters even if one fails
          continue;
        }
      }

      this.setStatus(ComponentStatus.READY);
    } catch (error) {
      console.error('\x1b[33mError in device manager initialization:\x1b[0m', error);
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

    for (const [deviceName, deviceInfo] of this.devices) {
      try {
        await new Promise<void>((resolve, reject) => {
          deviceInfo.device.close((err: Error | null) => {
            if (err) reject(err);
            else resolve();
          });
        });
      } catch (error) {
        console.error(`\x1b[33mError closing device ${deviceName}:\x1b[0m`, error);
      }
    }
    this.devices.clear();
    this.setStatus(ComponentStatus.UNINITIALIZED);
  }

  public async connectDevice(deviceName: DeviceName, portName: string, config: ArduinoConfig): Promise<void> {
    console.log(`Connecting to device ${deviceName} at ${portName}`);
    try {
      // Disconnect if already connected
      if (this.devices.has(deviceName)) {
        await this.disconnectDevice(deviceName);
      }

      const device = await this.createDevice(portName, config);
      this.devices.set(deviceName, {
        deviceName,
        portName,
        device,
        config,
      });
      this.socketManager.emitComponentStatusUpdate(deviceName, ComponentStatus.READY, null);
    } catch (error) {
      this.socketManager.emitComponentStatusUpdate(
        deviceName,
        ComponentStatus.ERROR,
        error instanceof Error ? error.message : 'Unknown error',
      );
      throw error;
    }
  }

  public async disconnectDevice(deviceName: DeviceName): Promise<void> {
    const deviceInfo = this.devices.get(deviceName);
    if (deviceInfo) {
      await new Promise<void>((resolve, reject) => {
        deviceInfo.device.close((err: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
      });
      this.devices.delete(deviceName);
      this.socketManager.emitComponentStatusUpdate(deviceName, ComponentStatus.UNINITIALIZED, null);
    }
  }

  private async createDevice(portName: string, config: ArduinoConfig): Promise<SerialPort | SerialPortMock> {
    const isDevMode = process.env.NEXT_PUBLIC_ENVIRONMENT === 'Development';
    try {
      // Create the device without error callback in constructor
      const device = isDevMode
        ? new SerialPortMock({ path: portName, baudRate: 9600 })
        : new SerialPort({
            path: portName,
            baudRate: 9600,
          });

      // Wait for the port to be fully opened
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`Timeout waiting for device to open at ${portName}`));
        }, 5000); // 5 second timeout

        device.on('open', () => {
          clearTimeout(timeout);
          resolve();
        });

        device.on('error', (err) => {
          clearTimeout(timeout);
          console.error(`\x1b[33mError opening device at ${portName}:\x1b[0m`, err);
          reject(err);
        });
      });

      // Set up the parser to process incoming data
      const parser = device.pipe(new ReadlineParser({ delimiter: '\r\n' }));
      parser.on('data', (data) => this.handleDeviceData(portName, data));

      return device;
    } catch (error) {
      console.error(`\x1b[33mError creating device at ${portName}:\x1b[0m`, error);
      throw error;
    }
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

  private handleDeviceData(portName: string, data: string): void {
    // Find the device info by port name
    const deviceInfo = Array.from(this.devices.values()).find((info) => info.portName === portName);
    if (!deviceInfo) {
      console.error(`\x1b[33mNo device info found for port ${portName}\x1b[0m`);
      return;
    }
    console.log(`\x1b[1m${deviceInfo.deviceName}\x1b[0m:`, data);

    if (data.includes('Ready')) {
      let configMessage = '';
      switch (deviceInfo.config.deviceType) {
        case 'sorter':
          configMessage = this.buildSorterInitMessage(deviceInfo.config);
          break;
        case 'conveyor_jets':
          configMessage = this.buildConveyorJetsInitMessage(deviceInfo.config);
          break;
        case 'hopper_feeder':
          configMessage = this.buildHopperFeederInitMessage(deviceInfo.config);
          break;
      }

      if (configMessage) {
        this.sendCommand(deviceInfo.deviceName, configMessage);
      }

      this.socketManager.emitComponentStatusUpdate(portName, ComponentStatus.READY, null);
    }
  }

  public sendCommand(deviceName: DeviceName, command: string, data?: number): void {
    const deviceInfo = this.devices.get(deviceName);
    if (!deviceInfo) {
      throw new Error(`Device ${deviceName} not found`);
    }

    const message = data !== undefined ? `${command}${data}` : command;
    const formattedMessage = `<${message}>`;

    deviceInfo.device.write(formattedMessage, (err: Error | null | undefined) => {
      if (err) {
        console.error(`\x1b[33mError sending message to ${deviceName}:\x1b[0m`, err);
        this.socketManager.emitComponentStatusUpdate(deviceName, ComponentStatus.ERROR, err.message);
      }
    });
  }

  protected notifyStatusChange(): void {
    this.socketManager.emitComponentStatusUpdate(this.getName(), this.getStatus(), this.getError());
  }

  public async listSerialPorts(): Promise<string[]> {
    if (process.env.NEXT_PUBLIC_ENVIRONMENT === 'Development') {
      return [
        '/dev/tty.usbmodem1101', // sorter_A
        '/dev/tty.usbmodem1201', // sorter_B
        '/dev/tty.usbmodem1401', // conveyor_jets
        '/dev/tty.usbserial-130', // hopper_feeder
      ];
    }
    const ports = await SerialPort.list();
    return ports.map((port) => port.path);
  }
}
