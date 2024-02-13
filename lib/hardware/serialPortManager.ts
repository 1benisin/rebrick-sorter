import ArduinoDevice from './arduinoDevice';
import { SerialPort } from 'serialport';

enum PortPaths {
  sorter_A = '/dev/cu.usbmodem1101',
  sorter_B = '/dev/cu.usbmodem1201',
  feeder = '/dev/cu.usbmodem1301',
  conveyor = '/dev/cu.usbmodem1401',
}

class SerialPortManager {
  devices: Record<string, ArduinoDevice>;
  portStatuses: Record<string, boolean>;

  constructor() {
    this.devices = {};
    this.portStatuses = {};
    // Initialize devices for each port path
    // this.addDevice(PortPaths.sorter_A);
    // for (const portPath in PortPaths) {
    //   this.addDevice(portPath);
    // }
  }

  // Method to list available serial ports
  async listSerialPorts() {
    return await SerialPort.list();
  }

  addDevice(portName: string) {
    try {
      if (!this.devices[portName]) {
        console.log(`Adding device for port ${portName}`);
        this.devices[portName] = new ArduinoDevice(portName);
        this.portStatuses[portName] = true;
      }
    } catch (error) {
      this.portStatuses[portName] = false;
      console.error(`Error adding device for port ${portName}:`, error);
    }
  }

  sendCommandToArduino(portName: string, command: string) {
    if (this.devices[portName]) {
      this.devices[portName].sendCommand(command);
    } else {
      console.log(`Device ${portName} not found`);
    }
  }
}

export default new SerialPortManager();
