"use strict";
// server/arduinoDevice.ts
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
// lib/hardware/arduinoDevice.ts
const serialport_1 = require("serialport");
class ArduinoDevice {
    constructor(portPath) {
        this.port = null;
        this.portPath = '';
        // Static factory method
        this.connect = () => __awaiter(this, void 0, void 0, function* () {
            // Wait for the port to be opened
            return yield new Promise((resolve, reject) => {
                this.port = new serialport_1.SerialPort({
                    path: this.portPath,
                    baudRate: 9600,
                }, (err) => {
                    if (err) {
                        reject(err.message);
                    }
                });
                // Set up the parser to process incoming data
                const parser = this.port.pipe(new serialport_1.ReadlineParser({ delimiter: '\r\n' }));
                parser.on('data', (data) => this.handleData(data));
                this.port.on('open', () => {
                    console.log(`${this.portPath} opened`);
                    resolve();
                });
                this.port.on('error', (err) => {
                    console.error(`Error on ${this.portPath}:`, err.message);
                });
            });
        });
        // Mock factory method
        this.connectMock = () => __awaiter(this, void 0, void 0, function* () {
            // Wait for the port to be opened
            return yield new Promise((resolve, reject) => {
                serialport_1.SerialPortMock.binding.createPort(this.portPath);
                this.port = new serialport_1.SerialPortMock({
                    path: this.portPath,
                    baudRate: 9600,
                }, (err) => {
                    if (err) {
                        reject(err.message);
                    }
                });
                // Set up the parser to process incoming data
                const parser = this.port.pipe(new serialport_1.ReadlineParser({ delimiter: '\r\n' }));
                parser.on('data', (data) => this.handleData(data));
                this.port.on('open', () => {
                    console.log(`${this.portPath} MOCK opened`);
                    resolve();
                });
                this.port.on('error', (err) => {
                    console.error(`Error on ${this.portPath}:`, err.message);
                });
            });
        });
        // Method to disconnect from the Arduino
        this.disconnect = () => {
            if (!this.port) {
                console.error('No port connected');
                return;
            }
            this.port.close((err) => {
                var _a;
                if (err) {
                    console.error(`Error closing ${(_a = this.port) === null || _a === void 0 ? void 0 : _a.path}:`, err.message);
                }
            });
        };
        // Function to construct message to send to arduino
        this.constructMessage = (msg) => {
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
        this.isOpen = () => {
            if (!this.port) {
                console.error('No port to handle data from');
                return;
            }
            return this.port.isOpen;
        };
        // Method to handle incoming data from the Arduino
        this.handleData = (data) => {
            if (!this.port) {
                console.error('No port to handle data from');
                return;
            }
            console.log(`Data received from ${this.port.path}:`, data);
        };
        // Method to send a command to the Arduino
        this.sendCommand = (command, data) => {
            if (!this.port) {
                console.error('No port to handle data from');
                return;
            }
            const message = data ? `${command}${data}` : command;
            const formattedMessage = this.constructMessage(message);
            this.port.write(formattedMessage, (err) => {
                var _a;
                if (err) {
                    console.error(`Error sending message: ${message} - to portPath: ${(_a = this.port) === null || _a === void 0 ? void 0 : _a.path}: `, err.message);
                }
            });
        };
        this.portPath = portPath;
    }
}
exports.default = ArduinoDevice;
