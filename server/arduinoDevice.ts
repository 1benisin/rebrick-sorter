// server/arduinoDevice.ts

import { SerialPort, ReadlineParser, SerialPortMock } from 'serialport';
import { SorterSettingsType } from '../types/settings.type';
import { ArduinoConfig, ConveyorJetsInitConfig, SorterInitConfig } from './arduinoConfig.type';

export default class ArduinoDevice {
  private port: SerialPort | SerialPortMock | null = null;
  portPath: string = '';
  config: ArduinoConfig | null;

  constructor(portPath: string, config: ArduinoConfig) {
    this.portPath = portPath;
    this.config = config;
  }

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
        resolve();
      });

      this.port.on('error', (err) => {
        console.error(`Error on ${this.portPath}:`, err.message);
      });
    });
  };

  // Method to disconnect from the Arduino
  disconnect = async (): Promise<void> => {
    if (!this.port) {
      console.error('No port connected');
      return Promise.reject('No port connected');
    }

    return new Promise((resolve, reject) => {
      this.port!.close((err) => {
        if (err) {
          console.error(`Error closing ${this.port?.path}:`, err.message);
          reject(err);
        } else {
          resolve();
        }
      });
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

  // Method to send a command to the Arduino
  sendCommand = (command: string, data?: number) => {
    if (!this.port) {
      console.error('No port to handle data from');
      return;
    }
    const message = data !== undefined ? `${command}${data}` : command;
    const formattedMessage = this.constructMessage(message);
    this.port.write(formattedMessage, (err) => {
      if (err) {
        console.error(`Error sending message: ${message} - to portPath: ${this.port?.path}: `, err.message);
      }
    });
  };

  // Create specific message builders for each device type
  private buildSorterInitMessage(config: SorterInitConfig): string {
    const configValues = [
      config.GRID_DIMENSION,
      config.X_OFFSET,
      config.Y_OFFSET,
      config.X_STEPS_TO_LAST,
      config.Y_STEPS_TO_LAST,
      config.ACCELERATION,
      config.HOMING_SPEED,
      config.SPEED,
      config.ROW_MAJOR_ORDER ? 1 : 0,
    ];
    return 's,' + configValues.join(',');
  }

  private buildConveyorJetsInitMessage(config: ConveyorJetsInitConfig): string {
    const jetFireTimes = config.JET_END_POSITIONS.map((end, index) => end - config.JET_START_POSITIONS[index]);
    return 's,' + jetFireTimes.join(',');
  }

  // Updated handleData method
  handleData = (data: string) => {
    if (!this.port || !this.config) {
      console.error('No port or config to handle data from');
      return;
    }
    console.log(`Data received from ${this.portPath}:`, data);

    if (data.includes('Ready')) {
      let configMessage = '';

      if (this.config.deviceType === 'sorter') {
        configMessage = this.buildSorterInitMessage(this.config);
      } else if (this.config.deviceType === 'conveyor_jets') {
        configMessage = this.buildConveyorJetsInitMessage(this.config);
      }

      if (configMessage) {
        this.sendCommand(configMessage);
      }
    }
  };
}
