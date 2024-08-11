// server/serialPortManager.ts

// lib/hardware/serialPortManager.ts

import ArduinoDevice from './arduinoDevice';
import { SerialPort, SerialPortMock } from 'serialport';
import { ArduinoDeviceCommand } from '../types/arduinoCommands.type';
import { SerialPortType } from '../types/serialPort.type';

const MockedPorts = [
  { name: 'sorter_A', path: '/dev/tty.usbmodem1101' },
  { name: 'sorter_B', path: '/dev/tty.usbmodem1201' },
  { name: 'conveyor_jets', path: '/dev/tty.usbmodem1401' },
  { name: 'hopper_feeder', path: '/dev/tty.usbserial-130' },
];
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

  async connectPorts(
    serialPortsToConnect: SerialPortType[],
  ): Promise<{ port: SerialPortType; success: boolean; error?: any }[]> {
    console.log('serialPortsToConnect', serialPortsToConnect);
    const devicePromises = serialPortsToConnect.map((port) =>
      this.connectPort(port.path)
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
      return MockedPorts;
    }
    return await SerialPort.list();
  }

  private async connectPort(portPath: string): Promise<void> {
    // Check if the device has already been added
    if (this.devices[portPath]) {
      console.log(`Device for port ${portPath} already added.`);
      return;
    }
    try {
      // Attempt to create the device
      let device = new ArduinoDevice(portPath);
      if (process.env.NEXT_PUBLIC_ENVIRONMENT === 'DEV') {
        await device.connectMock();
      } else {
        await device.connect();
      }
      this.devices[portPath] = device;
    } catch (error) {
      console.error(`Error adding device for port ${portPath}:`, error);
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
