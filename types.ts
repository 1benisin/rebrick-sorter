import { z } from 'zod';

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
// sorters can be an array of sorterSchema or empty
export const settingsSchema = z.object({
  conveyorSpeed_PPS: z.number(),
  detectDistanceThreshold: z.number(),
  sorters: z.array(sorterSchema).optional(),
});
export type Settings = z.infer<typeof settingsSchema>;

export type Detection = {
  view: 'top' | 'side';
  timestamp: number;
  centroid: { x: number; y: number };
  box: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  imageURI?: string;
};

export type Alert = {
  type: 'error' | 'update';
  message: string;
  timestamp: number;
  title?: string;
};
