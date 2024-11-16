// types/serialPort.type.ts

import { z } from 'zod';

export type SerialPortName = 'sorter_A' | 'sorter_B' | 'sorter_C' | 'sorter_D' | 'conveyor_jets' | 'hopper_feeder';

export const serialPortNames: { [key: string]: string; [key: number]: string } = {
  0: 'sorter_A',
  1: 'sorter_B',
  2: 'sorter_C',
  3: 'sorter_D',
  4: 'conveyor_jets',
  5: 'hopper_feeder',
  sorter_A: 'sorter_A',
  sorter_B: 'sorter_B',
  sorter_C: 'sorter_C',
  sorter_D: 'sorter_D',
  conveyor_jets: 'conveyor_jets',
  hopper_feeder: 'hopper_feeder',
} as const;

export const serialPortNamesArray = [
  'sorter_A',
  'sorter_B',
  'sorter_C',
  'sorter_D',
  'conveyor_jets',
  'hopper_feeder',
] as const;

// make a z enum from the keys of serialPortNames
export const serialPortNameEnumSchema = z.enum(serialPortNamesArray);

export const serialPortSchema = z.object({
  name: serialPortNameEnumSchema,
  path: z.string(),
});

export type SerialPortType = z.infer<typeof serialPortSchema>;
