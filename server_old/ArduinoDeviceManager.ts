// import ArduinoDevice from './arduinoDevice';
// import { SerialPort } from 'serialport';
// import { ArduinoDeviceCommand } from '../types/arduinoCommands.type';
// import eventHub from './eventHub';
// import { AllEvents, BackToFrontEvents } from '../types/socketMessage.type';
// import { SettingsType } from '../types/settings.type';
// import { SerialPortType } from '../types/serialPort.type';
// import { ArduinoConfig, SorterInitConfig } from './arduinoConfig.type';

// const MockedPorts = [
//   '/dev/tty.usbmodem1101', // sorter_A
//   '/dev/tty.usbmodem1201', // sorter_B
//   '/dev/tty.usbmodem1401', // conveyor_jets
//   '/dev/tty.usbserial-130', // hopper_feeder
// ];

// interface DeviceConfig extends SerialPortType {
//   config: ArduinoConfig;
// }

// class ArduinoDeviceManager {
//   private static instance: ArduinoDeviceManager;
//   private devices: Record<string, ArduinoDevice> = {};

//   // Private constructor to prevent direct instantiation
//   private constructor() {
//     eventHub.onEvent(AllEvents.LIST_SERIAL_PORTS, this.listSerialPorts);
//   }

//   // Method to get the singleton instance
//   static getInstance(): ArduinoDeviceManager {
//     if (!ArduinoDeviceManager.instance) {
//       ArduinoDeviceManager.instance = new ArduinoDeviceManager();
//     }
//     return ArduinoDeviceManager.instance;
//   }

//   private async connectWithErrorHandling(config: DeviceConfig) {
//     return this.connectPort(config)
//       .then(() => ({
//         success: true,
//       }))
//       .catch((error) => ({
//         success: false,
//         error,
//       }));
//   }

//   async connectAllDevices(initSettings: SettingsType): Promise<{ success: boolean; error?: any }[]> {
//     const deviceConfigs: DeviceConfig[] = [
//       ...initSettings.sorters.map((sorter) => {
//         const config: SorterInitConfig = {
//           deviceType: 'sorter',
//           GRID_DIMENSION: sorter.gridDimension,
//           X_OFFSET: sorter.xOffset,
//           Y_OFFSET: sorter.yOffset,
//           X_STEPS_TO_LAST: sorter.xStepsToLast,
//           Y_STEPS_TO_LAST: sorter.yStepsToLast,
//           ACCELERATION: sorter.acceleration,
//           HOMING_SPEED: sorter.homingSpeed,
//           SPEED: sorter.speed,
//           ROW_MAJOR_ORDER: sorter.rowMajorOrder,
//         };
//         return {
//           name: sorter.name,
//           path: sorter.serialPort,
//           config,
//         };
//       }),
//       {
//         name: 'conveyor_jets',
//         path: initSettings.conveyorJetsSerialPort,
//         config: {
//           deviceType: 'conveyor_jets',
//           JET_START_POSITIONS: initSettings.sorters.map((sorter) => sorter.jetPositionStart),
//           JET_END_POSITIONS: initSettings.sorters.map((sorter) => sorter.jetPositionEnd),
//         },
//       },
//       {
//         name: 'hopper_feeder',
//         path: initSettings.hopperFeederSerialPort,
//         config: {
//           deviceType: 'hopper_feeder',
//           HOPPER_ACTION_INTERVAL: 20000, // 20 seconds
//           MOTOR_SPEED: 200,
//           DELAY_STOPPING_INTERVAL: 5,
//           PAUSE_INTERVAL: 1000,
//           SHORT_MOVE_INTERVAL: 250,
//         },
//       },
//     ];

//     return Promise.all(deviceConfigs.map((config) => this.connectWithErrorHandling(config)));
//   }

//   private async connectPort(deviceConfig: DeviceConfig): Promise<void> {
//     const { name, path, config } = deviceConfig;
//     const currentDevice = this.devices[path];
//     // disconnect the device if it is already connected
//     if (currentDevice) {
//       await currentDevice.disconnect();
//     }
//     if (!config) {
//       throw new Error('No config found for port');
//     }

//     try {
//       let device = new ArduinoDevice(path, config);
//       if (process.env.NEXT_PUBLIC_ENVIRONMENT === 'Development') {
//         await device.connectMock();
//       } else {
//         await device.connect();
//       }
//       this.devices[path] = device;
//       console.log(`Device for port ${path} connected with name ${name}`);
//     } catch (error) {
//       console.error(`Error adding device for port ${path}:`, error);
//       throw error;
//     }
//   }

//   public async disconnectAllDevices(): Promise<void> {
//     const disconnectPromises = Object.entries(this.devices).map(async ([portPath, device]) => {
//       try {
//         await device.disconnect();
//         console.log(`Successfully disconnected device on port ${portPath}`);
//       } catch (error) {
//         console.error(`Error disconnecting device on port ${portPath}:`, error);
//       }
//     });

//     await Promise.all(disconnectPromises);

//     // Clear the devices object
//     this.devices = {};
//     console.log('All devices have been disconnected and removed from the manager');
//   }

//   getAllDeviceStatus() {
//     return Object.keys(this.devices).map((portName) => {
//       return {
//         portName,
//         isOpen: this.devices[portName].isOpen(),
//       };
//     });
//   }

//   // Method to list available serial ports
//   async listSerialPorts() {
//     if (process.env.NEXT_PUBLIC_ENVIRONMENT === 'Development') {
//       eventHub.emit(BackToFrontEvents.LIST_SERIAL_PORTS_SUCCESS, MockedPorts);
//       return;
//     }
//     const ports = await SerialPort.list();
//     const portPaths = ports.map((port) => port.path);
//     eventHub.emit(BackToFrontEvents.LIST_SERIAL_PORTS_SUCCESS, portPaths);
//   }

//   removeDevice(portPath: string) {
//     if (this.devices[portPath]) {
//       this.devices[portPath].disconnect();
//       delete this.devices[portPath];
//     } else {
//       console.log(`Device ${portPath} not found`);
//     }
//   }

//   sendCommandToDevice(arduinoDeviceCommand: ArduinoDeviceCommand) {
//     if (this.devices[arduinoDeviceCommand.arduinoPath]) {
//       this.devices[arduinoDeviceCommand.arduinoPath].sendCommand(
//         arduinoDeviceCommand.command,
//         arduinoDeviceCommand.data,
//       );
//     } else {
//       console.log(`Device ${arduinoDeviceCommand.arduinoPath} not found`);
//     }
//   }
// }

// const arduinoDeviceManager = ArduinoDeviceManager.getInstance();
// export default arduinoDeviceManager;
