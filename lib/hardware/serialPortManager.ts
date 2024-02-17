import ArduinoDevice from './arduinoDevice';
import { SerialPort, SerialPortMock } from 'serialport';
import { ArduinoDeviceCommand } from '@/types/arduinoCommands.d';
import fs from 'fs';
import path from 'path';

export enum PortPaths {
  sorter_A = '/dev/cu.usbmodem1101',
  sorter_B = '/dev/cu.usbmodem1201',
  hopper_feeder = '/dev/cu.usbmodem1301',
  conveyor_jets = '/dev/cu.usbmodem1401',
}

const MockedPorts = [
  { name: 'sorter_A', path: '/mock/sorter_A_serial_port' },
  { name: 'sorter_B', path: '/mock/sorter_B_serial_port' },
  { name: 'hopper_feeder', path: '/mock/hopper_feeder_serial_port' },
  { name: 'conveyor_jets', path: '/mock/conveyor_jets_serial_port' },
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

  async init(): Promise<{ portName: string; status: 'success' | 'fail'; error?: any }[]> {
    const devicePromises = Object.values(PortPaths).map((portName) =>
      this.connectPort(portName)
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
    if (process.env.ENVIRONMENT === 'DEV') {
      return MockedPorts;
    }
    return await SerialPort.list();
  }

  // async addPort(portName: string, portPath: string): Promise<void> {
  //   // use file system to add device to local public arduino_devices.json file

  //   const filePath = path.join(__dirname, '../../public/arduino_devices.json');
  //   console.log('filePath', filePath);
  //   const data = fs.readFileSync(filePath);
  //   const arduinoDevices = JSON.parse(data.toString());
  //   // add new device to array
  //   arduinoDevices[portName] = portPath;
  //   // write to file
  //   fs.writeFileSync(filePath, JSON.stringify(arduinoDevices, null, 2));
  // }

  private async connectPort(portName: string): Promise<void> {
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
