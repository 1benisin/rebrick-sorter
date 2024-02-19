import { z } from 'zod';

export const binLookup = z.record(
  z.string(),
  z.object({
    bin: z.number(),
    sorter: z.number(),
  }),
);

export type BinLookup = z.infer<typeof binLookup>;
