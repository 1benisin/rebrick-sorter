import { BrickognizeResponse } from './types';
import { Detection } from './types';

export type DetectionPair = [Detection, Detection];

export type DetectionPairGroup = {
  id: string;
  detectionPairs: [Detection, Detection][];
  offScreen?: boolean;
  classifications?: [BrickognizeResponse, BrickognizeResponse];
  combineclassification?: ClassificationItem[];
  indexUsedToClassify?: number; // index of the detection used to classify
  sentToSorter?: boolean;
};

// combined results of two BrickognizeResponses
export type ClassificationItem = {
  type: string;
  score: number;
  id: string;
  name: string;
  img_url: string;
  external_sites?: any[];
  category: string;
};
