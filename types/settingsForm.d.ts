// In a new file, e.g., formSchema.ts
import { z } from 'zod';

export const settingsFormSchema = z.object({
  conveyorSpeed_PPS: z.coerce.number().min(1, { message: 'Conveyor speed must be greater than 0' }).default(1),
  detectDistanceThreshold: z.coerce.number().min(1, { message: 'Detect distance threshold must be greater than 0' }).default(1),
  conveyorJetsSerialPort: z.string().min(1, { message: 'Serial port must be at least 1 character long' }).default('default'),
  hopperFeederSerialPort: z.string().min(1, { message: 'Serial port must be at least 1 character long' }).default('default'),
  // Add array of serters
  sorters: z
    .array(
      z.object({
        name: z.string().min(1, { message: 'Name must be at least 1 character long' }).default('default'),
        serialPort: z.string().min(1, { message: 'Serial port must be at least 1 character long' }).default('default'),
        gridWidth: z.coerce.number().min(1, { message: 'Grid width must be greater than 0' }).default(1),
        gridHeight: z.coerce.number().min(1, { message: 'Grid height must be greater than 0' }).default(1),
      }),
    )
    .default([]),
});

export type SettingsFormType = z.infer<typeof settingsFormSchema>;
