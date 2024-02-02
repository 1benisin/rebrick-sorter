import { z } from "zod";

// Define Zod schema for sorter
export const sorterSchema = z.object({
  name: z.string(),
  gridDimensions: z.object({
    width: z.number(),
    height: z.number(),
  }),
  airJetPosition: z.number(),
  maxPartDimension: z.number(),
});
export type Sorter = z.infer<typeof sorterSchema>;

// Define Zod schema for the settings document
export const settingsSchema = z.object({
  conveyorVelocity: z.number(),
  sorters: z.array(sorterSchema),
});
export type Settings = z.infer<typeof settingsSchema>;

export type Detection = {
  imageURI: string;
  timestamp: number;
  centroid: [number, number];
  box: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
};
