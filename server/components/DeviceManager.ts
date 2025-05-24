import { BaseComponent, ComponentConfig, ComponentStatus } from './BaseComponent';
import { ArduinoConfig, DeviceType } from './arduinoConfig.type';
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
  private heartbeatIntervals: Map<DeviceName, NodeJS.Timeout> = new Map();
  private readonly HEARTBEAT_INTERVAL = 60 * 1000; // 1 minute
  private readonly RECONNECT_ATTEMPTS = 3;
  private readonly RECONNECT_DELAY = 2000; // 2 seconds

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
          deviceType: DeviceType.CONVEYOR_JETS,
          JET_START_POSITIONS: settings.sorters.map((sorter) => sorter.jetPositionStart),
          JET_END_POSITIONS: settings.sorters.map((sorter) => sorter.jetPositionEnd),
        });
      }

      if (settings.hopperFeederSerialPort) {
        try {
          await this.connectDevice(DeviceName.HOPPER_FEEDER, settings.hopperFeederSerialPort, {
            deviceType: DeviceType.HOPPER_FEEDER,
            HOPPER_CYCLE_INTERVAL: settings.hopperCycleInterval,
            FEEDER_VIBRATION_SPEED: settings.feederVibrationSpeed,
            FEEDER_STOP_DELAY: settings.feederStopDelay,
            FEEDER_PAUSE_TIME: settings.feederPauseTime,
            FEEDER_SHORT_MOVE_TIME: settings.feederShortMoveTime,
            FEEDER_LONG_MOVE_TIME: settings.feederLongMoveTime,
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
            deviceType: DeviceType.SORTER,
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

      // Register for settings updates
      this.settingsManager.registerSettingsUpdateCallback(this.updateSettings.bind(this));

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
    // Stop all heartbeats
    for (const deviceName of this.devices.keys()) {
      this.stopHeartbeat(deviceName);
    }

    // Unregister settings callback
    this.settingsManager.unregisterSettingsUpdateCallback(this.updateSettings.bind(this));

    for (const [deviceName, deviceInfo] of this.devices) {
      try {
        await new Promise<void>((resolve, reject) => {
          deviceInfo.device.close((err: Error | null) => {
            if (err) reject(err);
            else resolve();
          });
        });
      } catch (error) {
        console.error(`\x1b[33m Error closing device ${deviceName}:\x1b[0m`, error);
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

      const device = await this.createDevice(portName, deviceName);
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

  private async createDevice(portName: string, deviceName: DeviceName): Promise<SerialPort | SerialPortMock> {
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
          console.log(`\x1b[36m Connected to ${deviceName} at ${portName}\x1b[0m`);
          resolve();
        });

        device.on('error', (err) => {
          clearTimeout(timeout);
          console.error(`\x1b[33m Error opening device at ${portName}:\x1b[0m`, err);
          reject(err);
        });

        device.on('close', () => {
          console.log(`\x1b[33m Device ${deviceName} closed unexpectedly\x1b[0m`);
          this.handleDeviceDisconnection(deviceName);
        });
      });

      // Set up the parser to process incoming data
      const parser = device.pipe(new ReadlineParser({ delimiter: '\r\n' }));
      parser.on('data', (data) => {
        this.handleDeviceData(deviceName, data);
      });

      // Start heartbeat monitoring
      this.startHeartbeat(deviceName);

      return device;
    } catch (error) {
      console.error(`\x1b[33mError creating device at ${portName}:\x1b[0m`, error);
      throw error;
    }
  }

  private startHeartbeat(deviceName: DeviceName): void {
    // Clear any existing heartbeat
    this.stopHeartbeat(deviceName);

    const interval = setInterval(async () => {
      try {
        const deviceInfo = this.devices.get(deviceName);
        if (!deviceInfo) return;

        // Send a heartbeat command
        this.sendCommand(deviceName, 'h');

        // Set a timeout to check for response
        const timeout = setTimeout(() => {
          console.error(`\x1b[33mNo response from ${deviceName} during heartbeat check\x1b[0m`);
          this.handleDeviceDisconnection(deviceName);
        }, 2000);

        // Store the timeout in the device info
        deviceInfo.heartbeatTimeout = timeout;
      } catch (error) {
        console.error(`\x1b[33mError during heartbeat for ${deviceName}:\x1b[0m`, error);
        this.handleDeviceDisconnection(deviceName);
      }
    }, this.HEARTBEAT_INTERVAL);

    this.heartbeatIntervals.set(deviceName, interval);
  }

  private stopHeartbeat(deviceName: DeviceName): void {
    const interval = this.heartbeatIntervals.get(deviceName);
    if (interval) {
      clearInterval(interval);
      this.heartbeatIntervals.delete(deviceName);
    }

    const deviceInfo = this.devices.get(deviceName);
    if (deviceInfo?.heartbeatTimeout) {
      clearTimeout(deviceInfo.heartbeatTimeout);
      deviceInfo.heartbeatTimeout = undefined;
    }
  }

  private async handleDeviceDisconnection(deviceName: DeviceName): Promise<void> {
    console.log(`\x1b[33mDevice ${deviceName} disconnected, attempting to reconnect...\x1b[0m`);
    this.socketManager.emitComponentStatusUpdate(deviceName, ComponentStatus.ERROR, 'Device disconnected');

    // Stop the heartbeat
    this.stopHeartbeat(deviceName);

    // Attempt to reconnect
    const deviceInfo = this.devices.get(deviceName);
    if (!deviceInfo) return;

    let attempts = 0;
    while (attempts < this.RECONNECT_ATTEMPTS) {
      try {
        await this.disconnectDevice(deviceName);
        await new Promise((resolve) => setTimeout(resolve, this.RECONNECT_DELAY));
        await this.connectDevice(deviceName, deviceInfo.portName, deviceInfo.config);
        console.log(`\x1b[32mSuccessfully reconnected to ${deviceName}\x1b[0m`);
        return;
      } catch (error) {
        attempts++;
        console.error(`\x1b[33mReconnection attempt ${attempts} failed for ${deviceName}:\x1b[0m`, error);
      }
    }

    console.error(`\x1b[31mFailed to reconnect to ${deviceName} after ${this.RECONNECT_ATTEMPTS} attempts\x1b[0m`);
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
    const settings = this.settingsManager.getSettings();
    if (!settings) return '';
    return 's,' + jetFireTimes.join(',') + ',' + settings.maxConveyorRPM + ',' + settings.minConveyorRPM;
  }

  private buildHopperFeederInitMessage(config: ArduinoConfig): string {
    if (config.deviceType !== 'hopper_feeder') return '';
    const configValues = [
      config.HOPPER_CYCLE_INTERVAL,
      config.FEEDER_VIBRATION_SPEED,
      config.FEEDER_STOP_DELAY,
      config.FEEDER_PAUSE_TIME,
      config.FEEDER_SHORT_MOVE_TIME,
      config.FEEDER_LONG_MOVE_TIME,
    ];
    return 's,' + configValues.join(',');
  }

  private handleDeviceData(deviceName: DeviceName, data: string): void {
    // Find the device info by port name
    const deviceInfo = this.devices.get(deviceName);
    if (!deviceInfo) {
      console.error(`\x1b[33mNo device info found for port ${deviceName}\x1b[0m`);
      return;
    }
    console.log(`\x1b[1m${deviceName}\x1b[0m:`, data);

    // Clear heartbeat timeout if it exists
    if (deviceInfo.heartbeatTimeout) {
      clearTimeout(deviceInfo.heartbeatTimeout);
      deviceInfo.heartbeatTimeout = undefined;
    }

    if (data.trim() === 'Ready') {
      let configMessage = '';
      switch (deviceInfo.config.deviceType) {
        case DeviceType.SORTER:
          configMessage = this.buildSorterInitMessage(deviceInfo.config);
          break;
        case DeviceType.CONVEYOR_JETS:
          configMessage = this.buildConveyorJetsInitMessage(deviceInfo.config);
          break;
        case DeviceType.HOPPER_FEEDER:
          configMessage = this.buildHopperFeederInitMessage(deviceInfo.config);
          break;
      }

      if (configMessage) {
        this.sendCommand(deviceInfo.deviceName, configMessage);
      }

      this.socketManager.emitComponentStatusUpdate(deviceName, ComponentStatus.READY, null);
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

  public updateFeederPauseTime(pauseTime: number): void {
    const deviceInfo = this.devices.get(DeviceName.HOPPER_FEEDER);
    if (!deviceInfo) {
      console.warn('Hopper feeder device not found when trying to update pause time');
      return;
    }

    const message = `p,${pauseTime}`;
    const formattedMessage = `<${message}>`;

    deviceInfo.device.write(formattedMessage, (err: Error | null | undefined) => {
      if (err) {
        console.error('\x1b[33mError sending pause time update to hopper feeder:\x1b[0m', err);
        this.socketManager.emitComponentStatusUpdate(DeviceName.HOPPER_FEEDER, ComponentStatus.ERROR, err.message);
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

  public async updateSettings(): Promise<void> {
    try {
      const settings = this.settingsManager.getSettings();
      if (!settings) {
        throw new Error('Settings not available');
      }

      // Update hopper feeder settings if connected
      const hopperFeeder = this.devices.get(DeviceName.HOPPER_FEEDER);
      if (hopperFeeder) {
        const config = {
          ...hopperFeeder.config,
          HOPPER_CYCLE_INTERVAL: settings.hopperCycleInterval,
          FEEDER_VIBRATION_SPEED: settings.feederVibrationSpeed,
          FEEDER_STOP_DELAY: settings.feederStopDelay,
          FEEDER_PAUSE_TIME: settings.feederPauseTime,
          FEEDER_SHORT_MOVE_TIME: settings.feederShortMoveTime,
          FEEDER_LONG_MOVE_TIME: settings.feederLongMoveTime,
        };

        // Only send update if settings actually changed
        if (JSON.stringify(config) !== JSON.stringify(hopperFeeder.config)) {
          this.devices.set(DeviceName.HOPPER_FEEDER, { ...hopperFeeder, config });
          const configMessage = this.buildHopperFeederInitMessage(config);
          if (configMessage) {
            this.sendCommand(DeviceName.HOPPER_FEEDER, configMessage);
          }
        }
      }

      // Update sorter settings if connected
      for (let i = 0; i < settings.sorters.length; i++) {
        const sorter = settings.sorters[i];
        const deviceName = DeviceName[`SORTER_${i}` as keyof typeof DeviceName];
        const sorterDevice = this.devices.get(deviceName);

        if (sorterDevice) {
          const config = {
            ...sorterDevice.config,
            GRID_DIMENSION: sorter.gridDimension,
            X_OFFSET: sorter.xOffset,
            Y_OFFSET: sorter.yOffset,
            X_STEPS_TO_LAST: sorter.xStepsToLast,
            Y_STEPS_TO_LAST: sorter.yStepsToLast,
            ACCELERATION: sorter.acceleration,
            HOMING_SPEED: sorter.homingSpeed,
            SPEED: sorter.speed,
            ROW_MAJOR_ORDER: sorter.rowMajorOrder,
          };
          this.devices.set(deviceName, { ...sorterDevice, config });
          const configMessage = this.buildSorterInitMessage(config);
          if (configMessage) {
            this.sendCommand(deviceName, configMessage);
          }
        }
      }

      // Update conveyor jets settings if connected
      const conveyorJets = this.devices.get(DeviceName.CONVEYOR_JETS);
      if (conveyorJets) {
        const config = {
          ...conveyorJets.config,
          JET_START_POSITIONS: settings.sorters.map((sorter) => sorter.jetPositionStart),
          JET_END_POSITIONS: settings.sorters.map((sorter) => sorter.jetPositionEnd),
        };
        this.devices.set(DeviceName.CONVEYOR_JETS, { ...conveyorJets, config });
        const configMessage = this.buildConveyorJetsInitMessage(config);
        if (configMessage) {
          this.sendCommand(DeviceName.CONVEYOR_JETS, configMessage);
        }
      }
    } catch (error) {
      console.error('\x1b[33mError updating device settings:\x1b[0m', error);
      this.setError(error instanceof Error ? error.message : 'Unknown error updating device settings');
    }
  }
}
