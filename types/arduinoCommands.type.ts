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

const commandValues = Object.values(ArduinoCommands) as [string, ...string[]];

// Define the schema for ArduinoDeviceCommand
export const ArduinoDeviceCommandSchema = z.object({
  arduinoPath: z.string(),
  // must be a ArduinoCommands value
  command: z.enum(commandValues),
  data: z.number().optional(), // Making it optional to match @IsOptional()
});

// Infer the type from the schema
export type ArduinoDeviceCommand = z.infer<typeof ArduinoDeviceCommandSchema>;
