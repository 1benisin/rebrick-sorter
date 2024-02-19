import { z } from 'zod';
import { binLookup } from './binLookup.type';
import { serialPortSchema } from './serialPort.type';

export const hardwareInitSchema = z.object({
  binLookup: binLookup,
  defaultConveyorSpeed_PPS: z.number(), // pixels per second
  sorterTravelTimes: z.array(z.array(z.number())),
  sorterBinPositions: z.array(z.array(z.object({ x: z.number(), y: z.number() }))),
  serialPorts: z.array(serialPortSchema),
  jetPositions: z.array(z.number()),
});

export type HardwareInitDto = z.infer<typeof hardwareInitSchema>;
