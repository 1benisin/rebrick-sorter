import { IsString } from 'class-validator';

export class ArduinoPortType {
  @IsString()
  name: string;

  @IsString()
  path: string;
}

// name an enum of the arduino port names.
// valid name are 'sorter_A', 'sorter_B', 'conveyor_jets', 'hopper_feeder'
export enum ArduinoPortNames {
  sorter_A = 'sorter_A',
  sorter_B = 'sorter_B',
  conveyor_jets = 'conveyor_jets',
  hopper_feeder = 'hopper_feeder',
}
