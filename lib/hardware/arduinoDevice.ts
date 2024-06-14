// lib/hardware/arduinoDevice.ts

import { SerialPort, ReadlineParser, SerialPortMock } from 'serialport';
import { SerialPortType, SerialPortNameType } from '@/types/serialPort.type';

interface SorterArduinoConfig {
  gridDimension: number;
  xOffset: number;
  yOffset: number;
  xStepsToLast: number;
  yStepsToLast: number;
  acceleration: number;
  homingSpeed: number;
  speed: number;
}

// Default configuration object
// TODO: remove 'Partial' when all configurations are added
const allArduinoConfigs: Partial<Record<SerialPortNameType, SorterArduinoConfig | {}>> = {
  sorter_A: {
    gridDimension: 12,
    xOffset: 10,
    yOffset: 10,
    xStepsToLast: 6085,
    yStepsToLast: 6100,
    acceleration: 5000,
    homingSpeed: 1000,
    speed: 120,
  },
  sorter_B: {
    gridDimension: 16,
    xOffset: 40,
    yOffset: 10,
    xStepsToLast: 7920,
    yStepsToLast: 7820,
    acceleration: 6500,
    homingSpeed: 1000,
    speed: 175,
  },
  conveyor_jets: {},
  hopper_feeder: {},
};

export default class ArduinoDevice {
  private port: SerialPort | SerialPortMock | null = null;
  portPath: string = '';
  portName: SerialPortNameType;

  constructor(port: SerialPortType) {
    this.portPath = port.path;
    this.portName = port.name;
  }

  // Method to send configuration data to the Arduino
  sendConfigData = (config: SorterArduinoConfig) => {
    const configString = `${config.gridDimension},${config.xOffset},${config.yOffset},${config.xStepsToLast},${config.yStepsToLast},${config.acceleration},${config.homingSpeed},${config.speed}`;
    const formattedMessage = this.constructMessage(configString);
    this.port?.write(formattedMessage, (err) => {
      if (err) {
        console.error(`Error sending config data to portPath: ${this.port?.path}: `, err.message);
      }
    });
  };

  // Static factory method
  connect = async (): Promise<void> => {
    // Wait for the port to be opened
    return await new Promise((resolve, reject) => {
      this.port = new SerialPort(
        {
          path: this.portPath,
          baudRate: 9600,
        },
        (err) => {
          if (err) {
            reject(err.message);
          }
        },
      );

      // Set up the parser to process incoming data
      const parser = this.port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

      parser.on('data', (data) => this.handleData(data));

      this.port.on('open', () => {
        console.log(`${this.portPath} opened`);
        // Send configuration data if sorter
        if (this.portName.includes('sorter')) {
          const config = allArduinoConfigs[this.portName];
          if (config) {
            this.sendConfigData(config as SorterArduinoConfig);
          } else {
            console.error(`No configuration found for port name: ${this.portName}`);
          }
        }
        resolve();
      });

      this.port.on('error', (err) => {
        console.error(`Error on ${this.portPath}:`, err.message);
      });
    });
  };

  // Mock factory method
  connectMock = async (): Promise<void> => {
    // Wait for the port to be opened
    return await new Promise((resolve, reject) => {
      SerialPortMock.binding.createPort(this.portPath);

      this.port = new SerialPortMock(
        {
          path: this.portPath,
          baudRate: 9600,
        },
        (err) => {
          if (err) {
            reject(err.message);
          }
        },
      );

      // Set up the parser to process incoming data
      const parser = this.port.pipe(new ReadlineParser({ delimiter: '\r\n' }));
      parser.on('data', (data) => this.handleData(data));

      this.port.on('open', () => {
        console.log(`${this.portPath} MOCK opened`);
        // Send configuration data
        const config = allArduinoConfigs[this.portName];
        if (config) {
          this.sendConfigData(config as SorterArduinoConfig);
        } else {
          console.error(`No configuration found for port name: ${this.portName}`);
        }
      });

      this.port.on('error', (err) => {
        console.error(`Error on ${this.portPath}:`, err.message);
      });
    });
  };

  // Method to disconnect from the Arduino
  disconnect = () => {
    if (!this.port) {
      console.error('No port connected');
      return;
    }
    this.port.close((err) => {
      if (err) {
        console.error(`Error closing ${this.port?.path}:`, err.message);
      }
    });
  };

  // Function to construct message to send to arduino
  constructMessage = (msg: string) => {
    const START_MARKER = '<';
    const END_MARKER = '>';
    // Explanation of checksum:
    // checksum is the sum of all the ASCII values of the characters in the message, modulo 100
    let checksum = 0;
    for (let i = 0; i < msg.length; i++) {
      checksum += msg.charCodeAt(i);
    }
    checksum %= 100;

    // checksum is converted to a 2 digit decimal number and appended to the end of the message
    const formattedMessage = START_MARKER + msg + checksum.toString().padStart(2, '0') + END_MARKER;
    return formattedMessage;
  };

  isOpen = () => {
    if (!this.port) {
      console.error('No port to handle data from');
      return;
    }
    return this.port.isOpen;
  };

  // Method to handle incoming data from the Arduino
  handleData = (data: string) => {
    if (!this.port) {
      console.error('No port to handle data from');
      return;
    }
    console.log(`Data received from ${this.port.path}:`, data);
  };

  // Method to send a command to the Arduino
  sendCommand = (command: string, data?: number) => {
    if (!this.port) {
      console.error('No port to handle data from');
      return;
    }
    const message = data ? `${command}${data}` : command;
    const formattedMessage = this.constructMessage(message);
    this.port.write(formattedMessage, (err) => {
      if (err) {
        console.error(`Error sending message: ${message} - to portPath: ${this.port?.path}: `, err.message);
      }
    });
  };
}
