"use strict";
// server/serialPortManager.ts
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// lib/hardware/serialPortManager.ts
const arduinoDevice_1 = __importDefault(require("./arduinoDevice"));
const serialport_1 = require("serialport");
const MockedPorts = [
    { name: 'sorter_A', path: '/dev/tty.usbmodem1101' },
    { name: 'sorter_B', path: '/dev/tty.usbmodem1201' },
    { name: 'conveyor_jets', path: '/dev/tty.usbmodem1401' },
    { name: 'hopper_feeder', path: '/dev/tty.usbserial-130' },
];
class SerialPortManager {
    // Private constructor to prevent direct instantiation
    constructor() {
        this.devices = {};
    }
    // Method to get the singleton instance
    static getInstance() {
        if (!SerialPortManager.instance) {
            SerialPortManager.instance = new SerialPortManager();
        }
        return SerialPortManager.instance;
    }
    connectPorts(serialPortsToConnect) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log('serialPortsToConnect', serialPortsToConnect);
            const devicePromises = serialPortsToConnect.map((port) => this.connectPort(port.path)
                .then(() => ({
                port,
                success: true,
            }))
                .catch((error) => ({
                port,
                success: false,
                error,
            })));
            // Wait for all device creation attempts to settle
            return yield Promise.all(devicePromises);
        });
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
    listSerialPorts() {
        return __awaiter(this, void 0, void 0, function* () {
            if (process.env.NEXT_PUBLIC_ENVIRONMENT === 'DEV') {
                return MockedPorts;
            }
            return yield serialport_1.SerialPort.list();
        });
    }
    connectPort(portPath) {
        return __awaiter(this, void 0, void 0, function* () {
            // Check if the device has already been added
            if (this.devices[portPath]) {
                console.log(`Device for port ${portPath} already added.`);
                return;
            }
            try {
                // Attempt to create the device
                let device = new arduinoDevice_1.default(portPath);
                if (process.env.NEXT_PUBLIC_ENVIRONMENT === 'DEV') {
                    yield device.connectMock();
                }
                else {
                    yield device.connect();
                }
                this.devices[portPath] = device;
            }
            catch (error) {
                console.error(`Error adding device for port ${portPath}:`, error);
                throw error;
            }
        });
    }
    removeDevice(portPath) {
        if (this.devices[portPath]) {
            this.devices[portPath].disconnect();
            delete this.devices[portPath];
        }
        else {
            console.log(`Device ${portPath} not found`);
        }
    }
    sendCommandToDevice(arduinoDeviceCommand) {
        if (this.devices[arduinoDeviceCommand.arduinoPath]) {
            this.devices[arduinoDeviceCommand.arduinoPath].sendCommand(arduinoDeviceCommand.command, arduinoDeviceCommand.data);
        }
        else {
            console.log(`Device ${arduinoDeviceCommand.arduinoPath} not found`);
        }
    }
}
exports.default = SerialPortManager;
