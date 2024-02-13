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

export const brickognizeResponseSchema = z.object({
  listing_id: z.string(),
  bounding_box: z.object({
    left: z.number(),
    upper: z.number(),
    right: z.number(),
    lower: z.number(),
    image_width: z.number(),
    image_height: z.number(),
    score: z.number(),
  }),
  items: z.array(
    z.object({
      id: z.string(),
      score: z.number(),
      name: z.string(),
      img_url: z.string(),
      external_sites: z.array(
        z.object({
          name: z.string(),
          url: z.string(),
        }),
      ),
      category: z.string(),
      type: z.string(),
    }),
  ),
});
export type BrickognizeResponse = z.infer<typeof brickognizeResponseSchema>;

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
  imageURI: string;
};

export type DetectionGroup = {
  id: string;
  detections: Detection[];
  offScreen?: boolean;
  classification?: BrickognizeResponse;
  indexUsedToClassify?: number; // index of the detection used to classify
};

export type Alert = {
  type: 'error' | 'update';
  message: string;
  timestamp: number;
  title?: string;
};
