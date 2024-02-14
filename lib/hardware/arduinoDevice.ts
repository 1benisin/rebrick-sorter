import { SerialPort, ReadlineParser, SerialPortMock } from 'serialport';

export default class ArduinoDevice {
  private port: SerialPort | SerialPortMock | null = null;
  path: string = '';

  constructor() {}

  // Static factory method
  async connect(portName: string): Promise<void> {
    // Wait for the port to be opened
    return await new Promise((resolve, reject) => {
      this.port = new SerialPort(
        {
          path: portName,
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
        console.log(`${portName} opened`);
        this.path = portName;
        resolve();
      });

      this.port.on('error', (err) => {
        console.error(`Error on ${portName}:`, err.message);
      });
    });
  }

  // Mock factory method
  async connectMock(portName: string): Promise<void> {
    // Wait for the port to be opened
    return await new Promise((resolve, reject) => {
      SerialPortMock.binding.createPort(portName);

      this.port = new SerialPortMock(
        {
          path: portName,
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
        console.log(`${portName} opened`);
        resolve();
      });

      this.port.on('error', (err) => {
        console.error(`Error on ${portName}:`, err.message);
      });
    });
  }

  // Function to construct message to send to arduino
  static constructMessage(msg: string) {
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
    return START_MARKER + msg + checksum.toString().padStart(2, '0') + END_MARKER;
  }

  isOpen() {
    if (!this.port) {
      console.error('No port to handle data from');
      return;
    }
    return this.port.isOpen;
  }

  // Method to handle incoming data from the Arduino
  handleData(data: string) {
    if (!this.port) {
      console.error('No port to handle data from');
      return;
    }
    console.log(`Data received from ${this.port.path}:`, data);
  }

  // Method to send a command to the Arduino
  sendCommand(command: string) {
    if (!this.port) {
      console.error('No port to handle data from');
      return;
    }
    const formattedCommand = ArduinoDevice.constructMessage(command);
    this.port.write(formattedCommand + '\n', (err) => {
      if (err) {
        console.error(`Error sending command to ${this.port?.path}:`, err.message);
      }
    });
  }
}
