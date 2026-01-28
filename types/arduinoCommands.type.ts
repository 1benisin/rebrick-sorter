// types/arduinoCommands.type.ts

import { z } from 'zod';

/**
 * Arduino Commands and Response Types
 *
 * This module defines the communication protocol between the server and Arduinos.
 *
 * ## Conveyor/Jets Arduino Commands
 * | Command | Format | Description |
 * |---------|--------|-------------|
 * | Toggle | `o` | Toggle conveyor motor on/off |
 * | Set RPM | `c<rpm>` | Set conveyor speed (e.g., `c55`) |
 * | Fire Jet | `j<jet>` | Fire jet immediately for testing |
 * | Queue Jet | `q<jet>,<pos>` | Queue jet to fire at encoder position |
 * | Get Position | `e` | Request current encoder position |
 * | Reset Encoder | `r` | Reset encoder position to 0 |
 * | Buffer Status | `b` | Request pending jets buffer status |
 * | Settings | `s,<params>` | Initialize settings |
 *
 * ## Conveyor/Jets Arduino Responses
 * | Response | Format | Description |
 * |----------|--------|-------------|
 * | Ready | `Ready` | Arduino booted and ready |
 * | Position | `EP:<pos>` | Encoder position report |
 * | Jet Fired | `JF:<jet>,<pos>` | Jet fired confirmation |
 * | Jet Queued | `JQ:<jet>,<pos>` | Jet queued confirmation |
 * | Buffer Status | `BS:<count>,<cap>` | Buffer status |
 * | Encoder Reset | `ER:<pos>` | Encoder reset confirmation |
 *
 * ## Sorter Arduino Commands
 * | Command | Format | Description |
 * |---------|--------|-------------|
 * | Move | `m<bin>` | Move to bin (e.g., `m045`) |
 * | Home | `a` | Start homing sequence |
 * | Center | `h` | Center sorter |
 *
 * ## Sorter Arduino Responses
 * | Response | Format | Description |
 * |----------|--------|-------------|
 * | Ready | `Ready` | Arduino booted |
 * | Move Complete | `MC:<bin>` | Arrived at bin |
 */

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
  // Encoder commands (conveyor_jets Arduino)
  QUEUE_JET: 'q', // Queue jet at position: q<jet>,<position>
  REQUEST_ENCODER_POSITION: 'e', // Request current encoder position
  RESET_ENCODER: 'r', // Reset encoder to 0 (same as RESET for conveyor Arduino)
  BUFFER_STATUS: 'b', // Request buffer status (same as HOPPER_ON_OFF char, different Arduino)
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
  // Encoder commands
  z.literal(ArduinoCommands.QUEUE_JET),
  z.literal(ArduinoCommands.REQUEST_ENCODER_POSITION),
  z.literal(ArduinoCommands.RESET_ENCODER),
  z.literal(ArduinoCommands.BUFFER_STATUS),
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

// ============================================================================
// Encoder Command Types (Phase 6)
// ============================================================================

/**
 * Typed conveyor commands for encoder-based scheduling.
 * Uses template literal types for precise command validation.
 *
 * Commands:
 * - 'o': Toggle conveyor on/off
 * - 'c<rpm>': Set RPM (e.g., 'c55')
 * - 'j<jet>': Fire jet immediately (e.g., 'j2')
 * - 'q<jet>,<pos>': Queue jet at encoder position (e.g., 'q2,14800')
 * - 'e': Request encoder position
 * - 'r': Reset encoder to 0
 * - 'b': Request buffer status
 */
export type ConveyorEncoderCommand =
  | 'o' // Toggle conveyor on/off
  | `c${number}` // Set RPM (e.g., c55)
  | `j${number}` // Fire jet immediately (e.g., j2)
  | `q${number},${number}` // Queue jet at position (e.g., q2,14800)
  | 'e' // Request encoder position
  | 'r' // Reset encoder to 0
  | 'b' // Request buffer status
  | `s,${string}`; // Settings command

/**
 * Arduino response patterns from conveyor Arduino.
 * Used for parsing and type-safe response handling.
 *
 * Responses:
 * - 'Ready': Arduino booted and ready
 * - 'EP:<pos>': Encoder position report
 * - 'JF:<jet>,<pos>': Jet fired confirmation
 * - 'JQ:<jet>,<pos>': Jet queued confirmation
 * - 'BS:<count>,<cap>': Buffer status
 * - 'ER:<pos>': Encoder reset confirmation
 */
export type ConveyorArduinoResponse =
  | 'Ready'
  | `EP:${number}` // Encoder position
  | `JF:${number},${number}` // Jet fired (jet, position)
  | `JQ:${number},${number}` // Jet queued (jet, position)
  | `BS:${number},${number}` // Buffer status (count, capacity)
  | `ER:${number}` // Encoder reset confirmation
  | 'Settings updated';

/**
 * Sorter Arduino commands.
 */
export type SorterCommand =
  | `m${number}` // Move to bin (e.g., m045)
  | 'a' // Home/origin
  | 'h'; // Center

/**
 * Sorter Arduino response patterns.
 */
export type SorterArduinoResponse = 'Ready' | `MC:${number}`; // Move complete (bin)
