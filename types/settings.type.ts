// types/settings.type.ts

import { z } from 'zod';
import { serialPortNameEnumSchema } from './serialPort.type';

export const sorterSettingsSchema = z.object({
  name: serialPortNameEnumSchema.default(serialPortNameEnumSchema.Values.conveyor_jets),
  serialPort: z.string().min(1).default('default'),
  jetPosition: z.coerce.number().min(0, { message: 'Jet position must be greater than or equal to 0' }).default(0),
  maxPartDimensions: z
    .object({
      width: z.coerce.number().min(1, { message: 'Max part width must be greater than 0' }).default(1),
      height: z.coerce.number().min(1, { message: 'Max part height must be greater than 0' }).default(1),
    })
    .default({ width: 1, height: 1 }),
  gridDimension: z.coerce.number().min(1).default(12),
  xOffset: z.coerce.number().default(10),
  yOffset: z.coerce.number().default(10),
  xStepsToLast: z.coerce.number().default(6085),
  yStepsToLast: z.coerce.number().default(6100),
  acceleration: z.coerce.number().min(0).default(5000),
  homingSpeed: z.coerce.number().min(0).default(1000),
  speed: z.coerce.number().min(0).default(120),
  rowMajorOrder: z.boolean().default(true),
});

export type SorterSettingsType = z.infer<typeof sorterSettingsSchema>;

export const settingsSchema = z.object({
  conveyorSpeed: z.coerce.number().min(0, { message: 'Conveyor speed must be greater than 0' }).default(1),
  detectDistanceThreshold: z.coerce
    .number()
    .min(1, { message: 'Detect distance threshold must be greater than 0' })
    .default(1),
  conveyorJetsSerialPort: z.string().default(''),
  hopperFeederSerialPort: z.string().default(''),
  classificationThresholdPercentage: z.coerce.number().min(0).max(2).default(1),
  camera1VerticalPositionPercentage: z.coerce.number().default(1),
  camera2VerticalPositionPercentage: z.coerce.number().default(-35),
  videoStreamId1: z.string().default(''), // deviceId
  videoStreamId2: z.string().default(''), // deviceId
  sorters: z.array(sorterSettingsSchema).default([]),
});

export type SettingsType = z.infer<typeof settingsSchema>;
