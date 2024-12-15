// types/hardwareInit.dto.ts

import { z } from 'zod';
import { serialPortSchema } from './serialPort.type';

export const hardwareInitSchema = z.object({
  defaultConveyorSpeed: z.number(), // pixels per second
  serialPorts: z.array(serialPortSchema),
  sorterDimensions: z.array(
    z.object({
      gridWidth: z.number(),
      gridHeight: z.number(),
    }),
  ),
  jetPositionsStart: z.array(z.number()),
  jetPositionsEnd: z.array(z.number()),
});

export type HardwareInitDto = z.infer<typeof hardwareInitSchema>;
