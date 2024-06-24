import { z } from 'zod';

export const ArduinoCommands = {
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
} as const;

// Creating a union of literals from arduinoCommands values
const arduinoCommandUnion = z.union([
  z.literal(ArduinoCommands.RESET),
  z.literal(ArduinoCommands.SETUP),
  z.literal(ArduinoCommands.CONVEYOR_ON_OFF),
  z.literal(ArduinoCommands.CONVEYOR_SPEED),
  z.literal(ArduinoCommands.FIRE_JET),
  z.literal(ArduinoCommands.CENTER_SORTER),
  z.literal(ArduinoCommands.MOVE_TO_ORIGIN),
  z.literal(ArduinoCommands.MOVE_TO_BIN),
  z.literal(ArduinoCommands.HOPPER_ON_OFF),
  z.literal(ArduinoCommands.FEEDER_ON_OFF),
]);

// Define the schema for ArduinoDeviceCommand
export const ArduinoDeviceCommandSchema = z.object({
  arduinoPath: z.string(),
  // must be a ArduinoCommands value
  command: arduinoCommandUnion,
  data: z.number().optional(), // Making it optional to match @IsOptional()
});

// Infer the type from the schema
export type ArduinoDeviceCommand = z.infer<typeof ArduinoDeviceCommandSchema>;
