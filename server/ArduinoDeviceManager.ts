import ArduinoDevice from './arduinoDevice';
import { SerialPort } from 'serialport';
import { ArduinoDeviceCommand } from '../types/arduinoCommands.type';
import { SerialPortName, SerialPortType } from '../types/serialPort.type';
import eventHub from './eventHub';
import { AllEvents, BackToFrontEvents } from '../types/socketMessage.type';
import { DeviceSettings } from './arduinoSettings.type';
import { SettingsType, SorterSettingsType } from '../types/settings.type';

const MockedPorts = [
  '/dev/tty.usbmodem1101', // sorter_A
  '/dev/tty.usbmodem1201', // sorter_B
  '/dev/tty.usbmodem1401', // conveyor_jets
  '/dev/tty.usbserial-130', // hopper_feeder
];

// Define settings for each device

interface PortWithSettings extends SerialPortType {
  deviceSettings?: SorterSettingsType | null;
}

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

  private async connectWithErrorHandling(port: PortWithSettings) {
    return this.connectPort(port)
      .then(() => ({
        port,
        success: true,
      }))
      .catch((error) => ({
        port,
        success: false,
        error,
      }));
  }

  async connectAllDevices(
    initSettings: SettingsType,
  ): Promise<{ port: PortWithSettings; success: boolean; error?: any }[]> {
    const portsToConnect: PortWithSettings[] = [
      ...initSettings.sorters.map((sorter) => ({
        name: sorter.name,
        path: sorter.serialPort,
        deviceSettings: sorter,
      })),
      {
        name: 'conveyor_jets',
        path: initSettings.conveyorJetsSerialPort,
        deviceSettings: null,
      },
      {
        name: 'hopper_feeder',
        path: initSettings.hopperFeederSerialPort,
        deviceSettings: null,
      },
    ];

    return Promise.all(portsToConnect.map((port) => this.connectWithErrorHandling(port)));
  }

  private async connectPort(port: PortWithSettings): Promise<void> {
    const { name, path, deviceSettings } = port;
    const currentDevice = this.devices[path];
    // disconnect the device if it is already connected
    if (currentDevice) {
      await currentDevice.disconnect();
    }
    try {
      let device = new ArduinoDevice(path, deviceSettings ?? null);
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
