import exp from 'constants';
import { z } from 'zod';

// sorter names must come first because they are referenced by index else where
export const serialPortNames: { [key: string]: string; [key: number]: string } = {
  0: 'sorter_A',
  1: 'sorter_B',
  2: 'conveyor_jets',
  3: 'hopper_feeder',
  sorter_A: 'sorter_A',
  sorter_B: 'sorter_B',
  conveyor_jets: 'conveyor_jets',
  hopper_feeder: 'hopper_feeder',
} as const;

export const serialPortNamesArray = ['sorter_A', 'sorter_B', 'conveyor_jets', 'hopper_feeder'] as const;

// make a z enum from the keys of serialPortNames
export const serialPortNameEnumSchema = z.enum(serialPortNamesArray);

export const serialPortSchema = z.object({
  name: serialPortNameEnumSchema,
  path: z.string(),
});

export type SerialPortType = z.infer<typeof serialPortSchema>;
