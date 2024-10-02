// server/arduinoDevice.ts

import { SerialPort, ReadlineParser, SerialPortMock } from 'serialport';
import { ConveyorJetsSettings, DeviceSettings, HopperFeederSettings, SorterSettings } from './arduinoSettings.type';

export default class ArduinoDevice {
  private port: SerialPort | SerialPortMock | null = null;
  portPath: string = '';
  settings: DeviceSettings;

  constructor(portPath: string, settings: DeviceSettings) {
    this.portPath = portPath;
    this.settings = settings;
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

  // Method to handle incoming data from the Arduino
  handleData = (data: string) => {
    if (!this.port) {
      console.error('No port to handle data from');
      return;
    }
    console.log(`Data received from ${this.port.path}:`, data);

    if (data.includes('Ready')) {
      let settingsMessage = '';

      if (this.settings.deviceType === 'sorter') {
        const sorterSettings = this.settings as SorterSettings;
        const settingsValues = [
          sorterSettings.GRID_DIMENSION,
          sorterSettings.X_OFFSET,
          sorterSettings.Y_OFFSET,
          sorterSettings.X_STEPS_TO_LAST,
          sorterSettings.Y_STEPS_TO_LAST,
          sorterSettings.ACCELERATION,
          sorterSettings.HOMING_SPEED,
          sorterSettings.SPEED,
        ];
        settingsMessage = 's,' + settingsValues.join(',');
      } else if (this.settings.deviceType === 'conveyor_jets') {
        const conveyorSettings = this.settings as ConveyorJetsSettings;
        const settingsValues = [conveyorSettings.JET_FIRE_TIME];
        settingsMessage = 's,' + settingsValues.join(',');
      } else if (this.settings.deviceType === 'hopper_feeder') {
        const hopperSettings = this.settings as HopperFeederSettings;
        const settingsValues = [
          hopperSettings.hopperStepsPerAction,
          hopperSettings.hopperActionInterval,
          hopperSettings.motorSpeed,
          hopperSettings.ACCELERATION,
          hopperSettings.SPEED,
        ];
        settingsMessage = 's,' + settingsValues.join(',');
      } else {
        console.error(`Unknown device type for ${this.port?.path}`);
        return;
      }

      this.sendCommand(settingsMessage);
    }
  };
}
