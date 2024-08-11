"use strict";
// types/arduinoCommands.type.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArduinoDeviceCommandSchema = exports.ArduinoCommands = void 0;
const zod_1 = require("zod");
exports.ArduinoCommands = {
    // general commands
    RESET: 'r', // data: null
    SETUP: 's', // data: null
    // conveyor & jet commands
    CONVEYOR_ON_OFF: 'o', // data: null
    CONVEYOR_SPEED: 'c', // data: speed (0-255)
    FIRE_JET: 'j', // data: jet number
    // sorter commands
    CENTER_SORTER: 'h', // data: null
    MOVE_TO_ORIGIN: 'a', // data: null
    MOVE_TO_BIN: 'm', // data: bin number
    // hopper & feeder commands
    HOPPER_ON_OFF: 'b', // data: null
    FEEDER_ON_OFF: 'f', // data: null
};
// Creating a union of literals from arduinoCommands values
const arduinoCommandUnion = zod_1.z.union([
    zod_1.z.literal(exports.ArduinoCommands.RESET),
    zod_1.z.literal(exports.ArduinoCommands.SETUP),
    zod_1.z.literal(exports.ArduinoCommands.CONVEYOR_ON_OFF),
    zod_1.z.literal(exports.ArduinoCommands.CONVEYOR_SPEED),
    zod_1.z.literal(exports.ArduinoCommands.FIRE_JET),
    zod_1.z.literal(exports.ArduinoCommands.CENTER_SORTER),
    zod_1.z.literal(exports.ArduinoCommands.MOVE_TO_ORIGIN),
    zod_1.z.literal(exports.ArduinoCommands.MOVE_TO_BIN),
    zod_1.z.literal(exports.ArduinoCommands.HOPPER_ON_OFF),
    zod_1.z.literal(exports.ArduinoCommands.FEEDER_ON_OFF),
]);
// Define the schema for ArduinoDeviceCommand
exports.ArduinoDeviceCommandSchema = zod_1.z.object({
    arduinoPath: zod_1.z.string(),
    // must be a ArduinoCommands value
    command: arduinoCommandUnion,
    data: zod_1.z.number().optional(), // Making it optional to match @IsOptional()
});
