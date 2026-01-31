// types/detectionPairs.d.ts

import { BrickognizeResponse } from './types';
import { Detection } from './types';

export type DetectionPair = [Detection, Detection];

export enum SkipSortReason {
  // 'tooLargeForSorter' | 'tooLowConfidence' | 'noBinForPartId';
  tooLargeForSorter = 'tooLargeForSorter',
  tooLowConfidence = 'tooLowConfidence',
  noBinForPartId = 'noBinForPartId',
  overCapacity = 'overCapacity',
}

export type DetectionPairGroup = {
  id: string;
  detectionPairs: [Detection, Detection][];
  offScreen?: boolean;
  classifications?: [BrickognizeResponse, BrickognizeResponse];
  combineclassification?: ClassificationItem[];
  indexUsedToClassify?: number; // index of the detection used to classify
  sentToSorter?: boolean;
  classifying?: boolean;
  classificationResult?: ClassificationItem;
  skipSort?: string;
  skipSortReason?: SkipSortReason;
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
  bin?: number;
  sorter?: number;
};

// --- Mock Data ---

// Mocking a Detection object (matches Detection type from types.ts)
const mockDetection: Detection = {
  view: 'top',
  timestamp: Date.now(),
  encoderAtDetection: 5000,
  centroid: { x: 640, y: 360 },
  box: { left: 600, top: 320, width: 80, height: 80 },
  imageURI: 'data:image/jpeg;base64,mock',
};

// Mocking a BrickognizeResponse object (matches brickognizeResponseSchema from types.ts)
const mockBrickognizeResponse: BrickognizeResponse = {
  listing_id: 'resp123',
  bounding_box: {
    left: 0,
    upper: 0,
    right: 100,
    lower: 100,
    image_width: 299,
    image_height: 299,
    score: 0.95,
  },
  items: [
    {
      id: '3001',
      score: 0.95,
      name: '2x4 Brick',
      img_url: 'https://example.com/brick.jpg',
      external_sites: [],
      category: 'Basic Brick',
      type: 'brick',
    },
  ],
};

// Mocking a ClassificationItem object
const mockClassificationItem: ClassificationItem = {
  type: 'brick',
  score: 0.95,
  id: '3001',
  name: '2x4 Brick',
  img_url: 'https://example.com/brick.jpg',
  external_sites: [],
  category: 'Basic Brick',
  bin: 5,
  sorter: 1,
};

// Creating a DetectionPairGroup with fake data
export const mockDetectionPairGroup: DetectionPairGroup = {
  id: 'group123',
  detectionPairs: [[mockDetection, { ...mockDetection, view: 'side' }]],
  offScreen: false,
  classifications: [mockBrickognizeResponse, mockBrickognizeResponse],
  combineclassification: [mockClassificationItem, mockClassificationItem],
  indexUsedToClassify: 0,
  sentToSorter: true,
  classifying: false,
  classificationResult: mockClassificationItem,
  skipSort: 'true',
  skipSortReason: SkipSortReason.tooLowConfidence,
};
