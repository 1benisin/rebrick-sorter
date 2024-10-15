// server/serialPortManager.ts

import ArduinoDevice from './arduinoDevice';
import { SerialPort } from 'serialport';
import { ArduinoDeviceCommand } from '../types/arduinoCommands.type';
import { SerialPortName, SerialPortType } from '../types/serialPort.type';
import eventHub from './eventHub';
import { AllEvents, BackToFrontEvents } from '../types/socketMessage.type';
import { DeviceSettings } from './arduinoSettings.type';

const MockedPorts = [
  '/dev/tty.usbmodem1101', // sorter_A
  '/dev/tty.usbmodem1201', // sorter_B
  '/dev/tty.usbmodem1401', // conveyor_jets
  '/dev/tty.usbserial-130', // hopper_feeder
];

// Define settings for each device
const deviceSettingsMap: Record<SerialPortName, DeviceSettings> = {
  sorter_A: {
    deviceType: 'sorter',
    GRID_DIMENSION: 16,
    X_OFFSET: 40,
    Y_OFFSET: 10,
    X_STEPS_TO_LAST: 7920,
    Y_STEPS_TO_LAST: 7820,
    ACCELERATION: 6500,
    HOMING_SPEED: 1000,
    SPEED: 175,
  },
  sorter_B: {
    deviceType: 'sorter',
    GRID_DIMENSION: 12,
    X_OFFSET: 10,
    Y_OFFSET: 10,
    X_STEPS_TO_LAST: 6085,
    Y_STEPS_TO_LAST: 6100,
    ACCELERATION: 5000,
    HOMING_SPEED: 1000,
    SPEED: 120,
  },
  conveyor_jets: {
    deviceType: 'conveyor_jets',
    JET_FIRE_TIME: 200,
  },
  hopper_feeder: {
    deviceType: 'hopper_feeder',
    hopperStepsPerAction: 2020,
    hopperActionInterval: 20000,
    motorSpeed: 200,
    ACCELERATION: 1000,
    SPEED: 1000,
  },
};

class ArduinoDeviceManager {
  private static instance: ArduinoDeviceManager;
  private devices: Record<string, ArduinoDevice> = {};

  // Private constructor to prevent direct instantiation
  private constructor() {
    eventHub.onEvent(AllEvents.LIST_SERIAL_PORTS, this.listSerialPorts);
  }

  // Method to get the singleton instance
  static getInstance(): ArduinoDeviceManager {
    if (!ArduinoDeviceManager.instance) {
      ArduinoDeviceManager.instance = new ArduinoDeviceManager();
    }
    return ArduinoDeviceManager.instance;
  }

  async connectAllDevices(
    serialPortsToConnect: SerialPortType[],
  ): Promise<{ port: SerialPortType; success: boolean; error?: any }[]> {
    console.log('serialPortsToConnect', serialPortsToConnect);
    const devicePromises = serialPortsToConnect.map((port) =>
      this.connectPort(port)
        .then(() => ({
          port,
          success: true,
        }))
        .catch((error) => ({
          port,
          success: false,
          error,
        })),
    );

    // Wait for all device creation attempts to settle
    return await Promise.all(devicePromises);
  }

  public async disconnectAllDevices(): Promise<void> {
    const disconnectPromises = Object.entries(this.devices).map(async ([portPath, device]) => {
      try {
        await device.disconnect();
        console.log(`Successfully disconnected device on port ${portPath}`);
      } catch (error) {
        console.error(`Error disconnecting device on port ${portPath}:`, error);
      }
    });

    await Promise.all(disconnectPromises);

    // Clear the devices object
    this.devices = {};
    console.log('All devices have been disconnected and removed from the manager');
  }

  getAllDeviceStatus() {
    return Object.keys(this.devices).map((portName) => {
      return {
        portName,
        isOpen: this.devices[portName].isOpen(),
      };
    });
  }

  // Method to list available serial ports
  async listSerialPorts() {
    if (process.env.NEXT_PUBLIC_ENVIRONMENT === 'DEV') {
      eventHub.emit(BackToFrontEvents.LIST_SERIAL_PORTS_SUCCESS, MockedPorts);
      return;
    }
    const ports = await SerialPort.list();
    const portPaths = ports.map((port) => port.path);
    eventHub.emit(BackToFrontEvents.LIST_SERIAL_PORTS_SUCCESS, portPaths);
  }

  private async connectPort(port: SerialPortType): Promise<void> {
    const { name, path } = port;
    // Check if the device has already been added
    if (this.devices[path]) {
      console.log(`Device for port ${path} already added.`);
      return;
    }
    try {
      // Retrieve settings based on device name
      const settings = deviceSettingsMap[name];
      if (!settings) {
        throw new Error(`No settings found for device name: ${name}`);
      }
      // Attempt to create the device
      let device = new ArduinoDevice(path, settings);
      if (process.env.NEXT_PUBLIC_ENVIRONMENT === 'DEV') {
        await device.connectMock();
      } else {
        await device.connect();
      }
      this.devices[path] = device;
      console.log(`Device for port ${path} connected with name ${name}`);
    } catch (error) {
      console.error(`Error adding device for port ${path}:`, error);
      throw error;
    }
  }

  removeDevice(portPath: string) {
    if (this.devices[portPath]) {
      this.devices[portPath].disconnect();
      delete this.devices[portPath];
    } else {
      console.log(`Device ${portPath} not found`);
    }
  }

  sendCommandToDevice(arduinoDeviceCommand: ArduinoDeviceCommand) {
    if (this.devices[arduinoDeviceCommand.arduinoPath]) {
      this.devices[arduinoDeviceCommand.arduinoPath].sendCommand(
        arduinoDeviceCommand.command,
        arduinoDeviceCommand.data,
      );
    } else {
      console.log(`Device ${arduinoDeviceCommand.arduinoPath} not found`);
    }
  }
}

const arduinoDeviceManager = ArduinoDeviceManager.getInstance();
export default arduinoDeviceManager;
