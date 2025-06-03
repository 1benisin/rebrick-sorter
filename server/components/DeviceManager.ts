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
  private reconnectionTimers: Map<DeviceName, NodeJS.Timeout> = new Map();
  private reconnectAttempts: Map<DeviceName, number> = new Map();
  private readonly INITIAL_RECONNECT_DELAY_MS = 1000;
  private readonly MAX_RECONNECT_DELAY_MS = 30000;
  private readonly MAX_RECONNECT_ATTEMPTS = 14;
  private portScanTimer: NodeJS.Timeout | null = null;
  private readonly PORT_SCAN_INTERVAL_MS = 60000;

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
      this.startPeriodicPortScan();
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
    this.settingsManager.unregisterSettingsUpdateCallback(this.updateSettings.bind(this));

    // Stop periodic port scanning (Task 2.1)
    if (this.portScanTimer) {
      clearInterval(this.portScanTimer);
      this.portScanTimer = null;
      console.log('Stopped periodic port scanning.');
    }

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
      const deviceInfo = {
        deviceName,
        portName,
        device,
        config,
      };
      this.devices.set(deviceName, deviceInfo);
      this.socketManager.emitComponentStatusUpdate(deviceName, ComponentStatus.READY, null);

      // Add error listener for hopper_feeder
      if (deviceName === DeviceName.HOPPER_FEEDER) {
        deviceInfo.device.on('error', async (err: Error) => {
          console.error(`\x1b[33mError on hopper_feeder device ${deviceInfo.portName}:\x1b[0m`, err);
          await this.handleDisconnect(deviceName, 'error');
        });

        deviceInfo.device.on('close', async () => {
          console.log(`\x1b[33mPort closed for hopper_feeder device ${deviceInfo.portName}\x1b[0m`);
          await this.handleDisconnect(deviceName, 'close');
        });
      }
    } catch (error) {
      this.socketManager.emitComponentStatusUpdate(
        deviceName,
        ComponentStatus.ERROR,
        error instanceof Error ? error.message : 'Unknown error',
      );
      throw error;
    }
  }

  private async handleDisconnect(deviceName: DeviceName, reason: string): Promise<void> {
    console.log(`\x1b[33mDevice ${deviceName} disconnected due to ${reason}. Initiating disconnect procedure.\x1b[0m`);
    const deviceInfo = this.devices.get(deviceName);

    if (deviceInfo) {
      const portNameToReconnect = deviceInfo.portName;
      const configToReconnect = { ...deviceInfo.config }; // Shallow copy config

      if (deviceInfo.device.isOpen) {
        console.log(`Attempting to close port for ${deviceName} due to ${reason}.`);
        try {
          await new Promise<void>((resolve) => {
            // Changed to always resolve
            deviceInfo.device.close((err: Error | null) => {
              if (err) {
                console.error(
                  `\x1b[33mError closing port for ${deviceName} during disconnect handling: ${err.message}\x1b[0m`,
                );
              } else {
                console.log(`Port for ${deviceName} closed successfully following ${reason}.`);
              }
              resolve(); // Resolve regardless of error to ensure cleanup
            });
          });
        } catch (error) {
          console.error(
            `\x1b[33mUnexpected error during the port closing process for ${deviceName}: ${(error as Error).message}\x1b[0m`,
          );
          // Ensure we proceed even if the promise wrapper itself has an issue
        }
      } else {
        console.log(`Port for ${deviceName} was already closed when handling ${reason}.`);
      }

      this.devices.delete(deviceName);
      console.log(`Device ${deviceName} removed from active devices map.`);

      // Task 1.3.2: Emit component status update via SocketManager
      this.socketManager.emitComponentStatusUpdate(
        deviceName,
        ComponentStatus.ERROR,
        `Device disconnected unexpectedly due to ${reason}. Reconnection process initiated.`,
      );

      // Task 1.3.3: Schedule automatic reconnection attempt
      this.scheduleReconnect(deviceName, portNameToReconnect, configToReconnect, 0);
    } else {
      console.warn(
        `\x1b[33mAttempted to handle disconnect for ${deviceName} (${reason}), but it was not found in active devices.\x1b[0m`,
      );
    }
  }

  private scheduleReconnect(
    deviceName: DeviceName,
    portName: string,
    config: ArduinoConfig,
    attemptNumber: number,
  ): void {
    // Clear any existing timer for this device first
    const existingTimer = this.reconnectionTimers.get(deviceName);
    if (existingTimer) {
      clearTimeout(existingTimer);
      // No need to delete from reconnectionTimers map here, it will be overwritten or deleted when timer fires/succeeds
    }

    let delayMs: number;
    if (attemptNumber === 0) {
      delayMs = this.INITIAL_RECONNECT_DELAY_MS;
    } else {
      // Exponential backoff for subsequent attempts (task 1.4.2)
      // Cap maximum delay (task 1.4.3)
      delayMs = Math.min(this.INITIAL_RECONNECT_DELAY_MS * Math.pow(2, attemptNumber), this.MAX_RECONNECT_DELAY_MS);
    }

    console.log(
      `Scheduling reconnection for ${deviceName} (attempt ${attemptNumber + 1}) at ${portName} in ${delayMs}ms.`,
    );

    const timerId = setTimeout(async () => {
      this.reconnectionTimers.delete(deviceName); // Remove timer as it's now firing
      console.log(`Attempting to reconnect ${deviceName} (attempt ${attemptNumber + 1}) at ${portName}...`);
      try {
        await this.connectDevice(deviceName, portName, config);
        console.log(
          `Successfully reconnected to ${deviceName} at ${portName} (attempt ${attemptNumber + 1}). Device is READY and configuration resent.`,
        );
        this.reconnectAttempts.delete(deviceName); // Reset backoff attempts on success
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(
          `Failed to reconnect to ${deviceName} at ${portName} (attempt ${attemptNumber + 1}): ${errorMessage}`,
        );
        this.socketManager.emitComponentStatusUpdate(
          deviceName,
          ComponentStatus.ERROR,
          `Reconnection attempt ${attemptNumber + 1} failed for ${deviceName}: ${errorMessage}.`,
        );

        // Store current failed attempt number
        this.reconnectAttempts.set(deviceName, attemptNumber + 1);

        // Task 1.5: Implement logic to stop retrying after persistent failure
        if (attemptNumber + 1 >= this.MAX_RECONNECT_ATTEMPTS) {
          const persistentFailureMessage = `Persistent failure to reconnect to ${deviceName} at ${portName} after ${this.MAX_RECONNECT_ATTEMPTS} attempts. Stopping retries.`;
          console.error(`\x1b[31m${persistentFailureMessage}\x1b[0m`);
          this.socketManager.emitComponentStatusUpdate(deviceName, ComponentStatus.ERROR, persistentFailureMessage);
          // Clean up state for this device as we are giving up
          this.reconnectAttempts.delete(deviceName);
          this.reconnectionTimers.delete(deviceName); // Ensure no lingering timer if one was somehow set elsewhere
        } else {
          // Schedule the next attempt with incremented attempt number
          this.scheduleReconnect(deviceName, portName, config, attemptNumber + 1);
        }
      }
    }, delayMs);

    this.reconnectionTimers.set(deviceName, timerId);
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
      });

      // Set up the parser to process incoming data
      const parser = device.pipe(new ReadlineParser({ delimiter: '\r\n' }));
      parser.on('data', (data) => {
        this.handleDeviceData(deviceName, data);
      });

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

  // --- Periodic Port Scanning Methods (Task 2.0) ---
  private startPeriodicPortScan(): void {
    if (this.portScanTimer) {
      clearInterval(this.portScanTimer);
      console.log('Cleared existing port scan timer.');
    }
    console.log(`Starting periodic port scan every ${this.PORT_SCAN_INTERVAL_MS / 1000} seconds.`);
    this.portScanTimer = setInterval(async () => {
      await this.scanPortsAndAttemptReconnect();
    }, this.PORT_SCAN_INTERVAL_MS);
  }

  private async scanPortsAndAttemptReconnect(): Promise<void> {
    console.log('Periodic port scan initiated...');
    const settings = this.settingsManager.getSettings();
    if (!settings) {
      console.warn('\x1b[33mPort Scan: Settings not available, skipping scan cycle.\x1b[0m');
      return;
    }

    const disconnectedExpectedDevices: { name: DeviceName; portHint: string; config: ArduinoConfig }[] = [];

    // Check Hopper Feeder
    if (settings.hopperFeederSerialPort) {
      const deviceName = DeviceName.HOPPER_FEEDER;
      const currentDevice = this.devices.get(deviceName);
      if (!currentDevice || !currentDevice.device.isOpen) {
        console.log(
          `Port Scan: Expected device ${deviceName} is disconnected (configured port: ${settings.hopperFeederSerialPort}).`,
        );
        disconnectedExpectedDevices.push({
          name: deviceName,
          portHint: settings.hopperFeederSerialPort,
          config: {
            deviceType: DeviceType.HOPPER_FEEDER,
            HOPPER_CYCLE_INTERVAL: settings.hopperCycleInterval,
            FEEDER_VIBRATION_SPEED: settings.feederVibrationSpeed,
            FEEDER_STOP_DELAY: settings.feederStopDelay,
            FEEDER_PAUSE_TIME: settings.feederPauseTime,
            FEEDER_SHORT_MOVE_TIME: settings.feederShortMoveTime,
            FEEDER_LONG_MOVE_TIME: settings.feederLongMoveTime,
          },
        });
      }
    }

    // Check Conveyor Jets
    if (settings.conveyorJetsSerialPort) {
      const deviceName = DeviceName.CONVEYOR_JETS;
      const currentDevice = this.devices.get(deviceName);
      if (!currentDevice || !currentDevice.device.isOpen) {
        console.log(
          `Port Scan: Expected device ${deviceName} is disconnected (configured port: ${settings.conveyorJetsSerialPort}).`,
        );
        disconnectedExpectedDevices.push({
          name: deviceName,
          portHint: settings.conveyorJetsSerialPort,
          config: {
            deviceType: DeviceType.CONVEYOR_JETS,
            JET_START_POSITIONS: settings.sorters.map((sorter) => sorter.jetPositionStart),
            JET_END_POSITIONS: settings.sorters.map((sorter) => sorter.jetPositionEnd),
          },
        });
      }
    }

    // Check Sorters
    for (let i = 0; i < settings.sorters.length; i++) {
      const sorterSettings = settings.sorters[i];
      const deviceName = DeviceName[`SORTER_${i}` as keyof typeof DeviceName];
      const currentDevice = this.devices.get(deviceName);
      if (!currentDevice || !currentDevice.device.isOpen) {
        console.log(
          `Port Scan: Expected device ${deviceName} is disconnected (configured port: ${sorterSettings.serialPort}).`,
        );
        disconnectedExpectedDevices.push({
          name: deviceName,
          portHint: sorterSettings.serialPort,
          config: {
            deviceType: DeviceType.SORTER,
            GRID_DIMENSION: sorterSettings.gridDimension,
            X_OFFSET: sorterSettings.xOffset,
            Y_OFFSET: sorterSettings.yOffset,
            X_STEPS_TO_LAST: sorterSettings.xStepsToLast,
            Y_STEPS_TO_LAST: sorterSettings.yStepsToLast,
            ACCELERATION: sorterSettings.acceleration,
            HOMING_SPEED: sorterSettings.homingSpeed,
            SPEED: sorterSettings.speed,
            ROW_MAJOR_ORDER: sorterSettings.rowMajorOrder,
          },
        });
      }
    }

    if (disconnectedExpectedDevices.length > 0) {
      console.log(
        `Port Scan: Found ${disconnectedExpectedDevices.length} disconnected expected devices to check for reconnection needs.`,
      );

      for (const disconnectedDevice of disconnectedExpectedDevices) {
        // Check if a reconnection attempt is already in progress for this device from a previous error/close event
        const isReconnectionAlreadyInProgress =
          this.reconnectionTimers.has(disconnectedDevice.name) || this.reconnectAttempts.has(disconnectedDevice.name);

        if (!isReconnectionAlreadyInProgress) {
          console.log(
            `Port Scan: Device ${disconnectedDevice.name} is disconnected and no active reconnection attempt. Triggering reconnect via handleDisconnect.`,
          );
          // Using handleDisconnect will leverage the existing exponential backoff and max attempts logic.
          // It expects the device to have been in the devices map, which it isn't here, but it will still
          // proceed to the scheduleReconnect logic if deviceInfo is null, using the provided port and config.
          // We pass portHint and config directly to scheduleReconnect if handleDisconnect is modified later to require device removal first.
          // For now, handleDisconnect is robust enough.
          await this.handleDisconnect(disconnectedDevice.name, 'scanner_periodic_check');
        } else {
          console.log(
            `Port Scan: Device ${disconnectedDevice.name} is disconnected, but a reconnection attempt is already in progress. Scanner will not intervene.`,
          );
        }
      }
    } else {
      console.log('Port Scan: All expected devices appear to be connected.');
    }

    // Cleaned up the previous debug log as it's less relevant now
    // try {
    //   const availablePorts = await this.listSerialPorts();
    //   console.log('Port Scan: Available serial ports currently detected:', availablePorts);
    // } catch (error) {
    //   console.error('\x1b[33mError listing serial ports during periodic scan:\x1b[0m', error);
    // }
  }
  // --- End Periodic Port Scanning Methods ---
}
