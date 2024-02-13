import { SerialPort, ReadlineParser } from 'serialport';
// const { SerialPort, ReadlineParser } = require('serialport');

console.log('serial port binding:', SerialPort.binding);

export default class ArduinoDevice {
  private port: SerialPort;

  constructor(portName: string) {
    // Initialize SerialPort with the given port name and baud rate
    this.port = new SerialPort({
      path: portName,
      baudRate: 9600,
    });

    console.log('serial port:', this.port);

    // Set up the parser to process incoming data
    const parser = this.port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

    // Event listener for data received from the Arduino
    parser.on('data', (data) => {
      this.handleData(data);
    });

    // Handle open event
    this.port.on('open', () => {
      console.log(`${portName} opened successfully`);
    });

    // Handle error event
    this.port.on('error', (err) => {
      console.error(`Error on ${portName}:`, err.message);
    });
  }

  // Method to handle incoming data from the Arduino
  handleData(data: string) {
    console.log(`Data received from ${this.port.path}:`, data);
  }

  // Method to send a command to the Arduino
  sendCommand(command: string) {
    this.port.write(command + '\n', (err) => {
      if (err) {
        console.error(`Error sending command to ${this.port.path}:`, err.message);
      } else {
        console.log(`Command sent to ${this.port.path}:`, command);
      }
    });
  }
}
