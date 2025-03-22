import { BaseComponent, ComponentConfig, ComponentStatus } from './BaseComponent';
import { ArduinoConfig } from './arduinoConfig.type';
import { SerialPort, ReadlineParser, SerialPortMock } from 'serialport';
import { SocketManager } from './SocketManager';
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
      console.log('Settings in device manager:', settings);

      // Connect to devices based on settings
      if (settings.conveyorJetsSerialPort) {
        console.log('Attempting to connect to conveyor jets device...');
        await this.connectDevice(settings.conveyorJetsSerialPort, {
          deviceType: 'conveyor_jets',
          JET_START_POSITIONS: settings.sorters.map((sorter) => sorter.jetPositionStart),
          JET_END_POSITIONS: settings.sorters.map((sorter) => sorter.jetPositionEnd),
        });
        console.log('Successfully connected to conveyor jets device');
      }

      if (settings.hopperFeederSerialPort) {
        console.log('Attempting to connect to hopper feeder device...');
        try {
          await this.connectDevice(settings.hopperFeederSerialPort, {
            deviceType: 'hopper_feeder',
            HOPPER_ACTION_INTERVAL: 20000,
            MOTOR_SPEED: 200,
            DELAY_STOPPING_INTERVAL: 5,
            PAUSE_INTERVAL: 1000,
            SHORT_MOVE_INTERVAL: 250,
          });
          console.log('Successfully connected to hopper feeder device');
        } catch (error) {
          console.error('Failed to connect to hopper feeder device:', error);
        }
      }

      // Connect to sorters
      for (const sorter of settings.sorters) {
        console.log(`Attempting to connect to sorter ${sorter.name} at ${sorter.serialPort}...`);
        try {
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
          console.log(`Successfully connected to sorter ${sorter.name}`);
          // Add delay between sorter connections
          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (error) {
          console.error(`Failed to connect to sorter ${sorter.name} at ${sorter.serialPort}:`, error);
          // Continue with other sorters even if one fails
          continue;
        }
      }

      this.setStatus(ComponentStatus.READY);
    } catch (error) {
      console.error('Error in device manager initialization:', error);
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

  public async connectDevice(portName: string, config: ArduinoConfig): Promise<void> {
    console.log(`Connecting to device at ${portName}`);
    try {
      // Disconnect if already connected
      if (this.devices.has(portName)) {
        await this.disconnectDevice(portName);
      }

      // Try to connect with retries
      let retries = 3;
      let lastError: Error | null = null;

      while (retries > 0) {
        try {
          const device = await this.createDevice(portName, config);
          this.devices.set(portName, device);
          this.deviceConfigs.set(portName, config);
          this.socketManager.emitComponentStatusUpdate(portName, ComponentStatus.READY, null);
          return;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          if (lastError.message.includes('Cannot lock port')) {
            retries--;
            if (retries > 0) {
              console.log(`Port ${portName} is locked, retrying in 1 second... (${retries} attempts left)`);
              await new Promise((resolve) => setTimeout(resolve, 1000));
              continue;
            }
          }
          throw error; // Re-throw if it's not a port locking issue or we're out of retries
        }
      }

      throw lastError || new Error(`Failed to connect to device at ${portName} after 3 attempts`);
    } catch (error) {
      this.socketManager.emitComponentStatusUpdate(
        portName,
        ComponentStatus.ERROR,
        error instanceof Error ? error.message : 'Unknown error',
      );
      throw error;
    }
  }

  public async disconnectDevice(portName: string): Promise<void> {
    const device = this.devices.get(portName);
    if (device) {
      await new Promise<void>((resolve, reject) => {
        device.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      this.devices.delete(portName);
      this.deviceConfigs.delete(portName);
      this.socketManager.emitComponentStatusUpdate(portName, ComponentStatus.UNINITIALIZED, null);
    }
  }

  private async createDevice(portName: string, config: ArduinoConfig): Promise<SerialPort | SerialPortMock> {
    const isDevMode = process.env.NEXT_PUBLIC_ENVIRONMENT === 'Development';
    console.log(`Using ${isDevMode ? 'mock' : 'real'} serial port for device at ${portName}`);
    try {
      // Create the device with error callback in constructor
      const device = isDevMode
        ? new SerialPortMock({ path: portName, baudRate: 9600 })
        : new SerialPort(
            {
              path: portName,
              baudRate: 9600,
            },
            (err) => {
              if (err) {
                console.error(`Error creating device at ${portName}:`, err);
                throw err;
              }
            },
          );

      // Wait for the port to be fully opened
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`Timeout opening port ${portName}`));
        }, 5000); // 5 second timeout

        device.on('open', () => {
          clearTimeout(timeout);
          console.log(`Successfully opened device at ${portName}`);
          resolve();
        });

        device.on('error', (err) => {
          clearTimeout(timeout);
          console.error(`Error opening device at ${portName}:`, err);
          reject(err);
        });
      });

      // Set up the parser to process incoming data
      const parser = device.pipe(new ReadlineParser({ delimiter: '\r\n' }));
      parser.on('data', (data) => this.handleDeviceData(portName, data));
      console.log(`Parser set up for device at ${portName}`);

      return device;
    } catch (error) {
      console.error(`Error creating device at ${portName}:`, error);
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
    console.log(`\x1b[1m${portName}\x1b[0m:`, data);
    if (data.includes('Ready')) {
      const config = this.deviceConfigs.get(portName);
      if (!config) {
        console.error(`No config found for device ${portName}`);
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
        this.sendCommand(portName, configMessage);
      }

      this.socketManager.emitComponentStatusUpdate(portName, ComponentStatus.READY, null);
    }
  }

  public sendCommand(portName: string, command: string, data?: number): void {
    const device = this.devices.get(portName);
    if (!device) {
      throw new Error(`Device ${portName} not found`);
    }

    const message = data !== undefined ? `${command}${data}` : command;
    const formattedMessage = `<${message}>`;

    device.write(formattedMessage, (err) => {
      if (err) {
        console.error(`Error sending message to ${portName}:`, err);
        this.socketManager.emitComponentStatusUpdate(portName, ComponentStatus.ERROR, err.message);
      }
    });
  }

  protected notifyStatusChange(): void {
    this.socketManager.emitComponentStatusUpdate(this.getName(), this.getStatus(), this.getError());
  }
}
