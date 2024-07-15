// types/sortPart.dto.ts

import { z } from 'zod';

export const sortPartSchema = z.object({
  partId: z.string(),
  initialTime: z.number(),
  initialPosition: z.number(),
  bin: z.number(),
  sorter: z.number(),
});

export type SortPartDto = z.infer<typeof sortPartSchema>;
