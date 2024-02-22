import { z } from 'zod';

export const binLookupSchema = z.record(
  z.string(),
  z.object({
    bin: z.number(),
    sorter: z.number(),
  }),
);

export type BinLookupType = z.infer<typeof binLookupSchema>;
