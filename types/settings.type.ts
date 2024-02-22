import { z } from 'zod';
import { serialPortNameEnumSchema } from './serialPort.type';

export const sorterSettingsSchema = z.object({
  name: serialPortNameEnumSchema.default(serialPortNameEnumSchema.Values.conveyor_jets),
  serialPort: z.string().min(1).default('default'),
  gridWidth: z.coerce.number().min(1, { message: 'Grid width must be greater than 0' }).default(1),
  gridHeight: z.coerce.number().min(1, { message: 'Grid height must be greater than 0' }).default(1),
  jetPosition: z.coerce.number().min(0, { message: 'Jet position must be greater than or equal to 0' }).default(0),
});

export const settingsSchema = z.object({
  conveyorSpeed_PPS: z.coerce.number().min(1, { message: 'Conveyor speed must be greater than 0' }).default(1),
  detectDistanceThreshold: z.coerce.number().min(1, { message: 'Detect distance threshold must be greater than 0' }).default(1),
  conveyorJetsSerialPort: z.string().min(1).default('default'),
  hopperFeederSerialPort: z.string().min(1).default('default'),
  classificationThresholdPercentage: z.coerce.number().min(0).max(2).default(1),
  camera1VerticalPositionPercentage: z.coerce.number().default(1),
  camera2VerticalPositionPercentage: z.coerce.number().default(-35),
  // Add array of serters
  sorters: z.array(sorterSettingsSchema).default([]),
});

export type SettingsType = z.infer<typeof settingsSchema>;
