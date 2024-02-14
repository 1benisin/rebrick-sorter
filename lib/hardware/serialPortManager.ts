import ArduinoDevice from './arduinoDevice';
import { SerialPort } from 'serialport';

enum PortPaths {
  sorter_A = '/dev/cu.usbmodem1101',
  sorter_B = '/dev/cu.usbmodem1201',
  feeder = '/dev/cu.usbmodem1301',
  conveyor = '/dev/cu.usbmodem1401',
}
class SerialPortManager {
  private static instance: SerialPortManager;
  private devices: Record<string, ArduinoDevice> = {};

  // Private constructor to prevent direct instantiation
  private constructor() {}

  // Method to get the singleton instance
  public static getInstance(): SerialPortManager {
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
    }
  }

  sendCommandToDevice(portName: string, command: string) {
    if (this.devices[portName]) {
      this.devices[portName].sendCommand(command);
    } else {
      console.log(`Device ${portName} not found`);
    }
  }
}

export default SerialPortManager.getInstance();
