import ArduinoDevice from './arduinoDevice';
import { SerialPort } from 'serialport';
import { ArduinoDeviceCommand } from '@/types/arduinoCommands.d';

enum PortPaths {
  sorter_A = '/dev/cu.usbmodem1101',
  sorter_B = '/dev/cu.usbmodem1201',
  feeder = '/dev/cu.usbmodem1301',
  conveyor = '/dev/cu.usbmodem1401',
}
export default class SerialPortManager {
  private static instance: SerialPortManager;
  private devices: Record<string, ArduinoDevice> = {};

  // Private constructor to prevent direct instantiation
  private constructor() {}

  // Method to get the singleton instance
  static getInstance(): SerialPortManager {
    if (!SerialPortManager.instance) {
      SerialPortManager.instance = new SerialPortManager();
    }
    return SerialPortManager.instance;
  }

  async init(): Promise<{ portName: string; status: 'success' | 'fail'; error?: any }[]> {
    const devicePromises = Object.values(PortPaths).map((portName) =>
      this.addDevice(portName)
        .then(() => ({
          status: 'success' as const,
          portName,
        }))
        .catch((error) => ({
          status: 'fail' as const,
          portName,
          error,
        })),
    );

    // Wait for all device creation attempts to settle
    return await Promise.all(devicePromises);
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
    return await SerialPort.list();
  }

  async addDevice(portName: string): Promise<void> {
    // Check if the device has already been added
    if (this.devices[portName]) {
      console.log(`Device for port ${portName} already added.`);
      return;
    }
    try {
      // Attempt to create the device
      let device = new ArduinoDevice();
      if (process.env.ENVIRONMENT === 'DEV') {
        await device.connectMock(portName);
      } else {
        await device.connect(portName);
      }
      this.devices[portName] = device;
    } catch (error) {
      console.error(`Error adding device for port ${portName}:`, error);
      throw error;
    }
  }

  removeDevice(portName: string) {
    if (this.devices[portName]) {
      this.devices[portName].disconnect();
      delete this.devices[portName];
    } else {
      console.log(`Device ${portName} not found`);
    }
  }

  sendCommandToDevice(arduinoDeviceCommand: ArduinoDeviceCommand) {
    if (this.devices[arduinoDeviceCommand.arduinoPath]) {
      this.devices[arduinoDeviceCommand.arduinoPath].sendCommand(arduinoDeviceCommand.command, arduinoDeviceCommand.data);
    } else {
      console.log(`Device ${arduinoDeviceCommand.arduinoPath} not found`);
    }
  }
}
