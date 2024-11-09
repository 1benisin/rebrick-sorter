// types/serialPort.type.ts

import { z } from 'zod';

export type SerialPortName = 'sorter_A' | 'sorter_B' | 'sorter_C' | 'sorter_D' | 'conveyor_jets' | 'hopper_feeder';

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
