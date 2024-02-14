// arduinoCommands.d.ts

import { IsEnum, IsInt, IsOptional, IsString, ValidateIf } from 'class-validator';

export enum ArduinoCommands {
  // general commands
  RESET = 'r', // data: null
  SETUP = 's', // data: null
  // conveyor & jet commands
  CONVEYOR_ON_OFF = 'o', // data: null
  CONVEYOR_SPEED = 'c', // data: speed (0-255)
  FIRE_JET = 'j', // data: jet number
  // sorter commands
  CENTER_SORTER = 'h', // data: null
  MOVE_TO_ORIGIN = 'a', // data: null
  MOVE_TO_BIN = 'm', // data: bin number
  // hopper & feeder commands
  HOPPER_ON_OFF = 'b', // data: null
  FEEDER_ON_OFF = 'f', // data: null
}

export class ArduinoDeviceCommand {
  @ValidateIf((o) => o.command !== ArduinoCommands.SETUP && o.command !== ArduinoCommands.RESET)
  @IsString()
  arduinoPath: string;

  @IsEnum(ArduinoCommands)
  command: ArduinoCommands;

  @IsInt()
  @IsOptional()
  data?: number;
}
