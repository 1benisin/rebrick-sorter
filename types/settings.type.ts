// types/settings.type.ts

import { z } from 'zod';
import { serialPortNameEnumSchema } from './serialPort.type';

export const sorterSettingsSchema = z.object({
  name: serialPortNameEnumSchema.default(serialPortNameEnumSchema.Values.conveyor_jets),
  serialPort: z.string().min(1).default('default'),
  jetPositionStart: z.coerce
    .number()
    .min(0, { message: 'Start jet position must be a non-negative number' })
    .max(99999, { message: 'Start jet position exceeds maximum allowed value' })
    .default(0),
  jetDuration: z.coerce
    .number()
    .min(1, { message: 'Jet duration must be at least 1 millisecond' })
    .max(1000, { message: 'Jet duration exceeds maximum allowed value' })
    .default(100),
  maxPartDimensions: z
    .object({
      width: z.coerce.number().min(1, { message: 'Part width must be at least 1 unit' }).default(1),
      height: z.coerce.number().min(1, { message: 'Part height must be at least 1 unit' }).default(1),
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
  conveyorSpeed: z.coerce.number().min(0, { message: 'Conveyor speed must be a non-negative number' }).default(1),
  maxConveyorRPM: z.coerce
    .number()
    .min(0, { message: 'Maximum conveyor RPM must be a non-negative number' })
    .default(100),
  minConveyorRPM: z.coerce
    .number()
    .min(0, { message: 'Minimum conveyor RPM must be a non-negative number' })
    .default(50),
  constantConveyorSpeed: z.boolean().default(false),
  detectDistanceThreshold: z.coerce
    .number()
    .min(1, { message: 'Detection threshold must be at least 1 unit' })
    .default(1),
  conveyorJetsSerialPort: z.string().default(''),
  hopperFeederSerialPort: z.string().default(''),
  classificationThresholdPercentage: z.coerce
    .number()
    .min(0, { message: 'Classification threshold must be between 0 and 2' })
    .max(2, { message: 'Classification threshold must be between 0 and 2' })
    .default(1),
  camera1VerticalPositionPercentage: z.coerce.number().default(1),
  camera2VerticalPositionPercentage: z.coerce.number().default(-35),
  videoStreamId1: z.string().default(''), // deviceId
  videoStreamId2: z.string().default(''), // deviceId
  feederVibrationSpeed: z.coerce.number().min(0).max(255).default(200),
  feederStopDelay: z.coerce.number().min(0).default(5),
  feederPauseTime: z.coerce.number().min(0).default(1000),
  feederShortMoveTime: z.coerce.number().min(0).default(250),
  feederLongMoveTime: z.coerce.number().min(0).default(2000),
  conveyorPulsesPerRevolution: z.coerce.number().min(0).default(20),
  conveyorKp: z.coerce.number().min(0).default(2.0),
  conveyorKi: z.coerce.number().min(0).default(5.0),
  conveyorKd: z.coerce.number().min(0).default(1.0),
  sorters: z.array(sorterSettingsSchema).default([]),
  hopperCycleInterval: z.coerce.number().min(0).default(20000),
});

export type SettingsType = z.infer<typeof settingsSchema>;
