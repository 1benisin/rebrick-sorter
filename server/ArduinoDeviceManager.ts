// server/serialPortManager.ts

// lib/hardware/serialPortManager.ts

import ArduinoDevice from './arduinoDevice';
import { SerialPort, SerialPortMock } from 'serialport';
import { ArduinoDeviceCommand } from '../types/arduinoCommands.type';
import { SerialPortType } from '../types/serialPort.type';
import eventHub from './eventHub';
import { AllEvents, BackToFrontEvents } from '../types/socketMessage.type';

const MockedPorts = [
  '/dev/tty.usbmodem1101',
  '/dev/tty.usbmodem1201',
  '/dev/tty.usbmodem1401',
  '/dev/tty.usbserial-130',
];

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

const arduinoDeviceManager = ArduinoDeviceManager.getInstance();
export default arduinoDeviceManager;
