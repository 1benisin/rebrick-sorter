import { BrickognizeResponse } from './types';
import { Detection } from './types';

export type DetectionPair = [Detection, Detection];

export enum SkipSortReason {
  // 'tooLargeForSorter' | 'tooLowConfidence' | 'noBinForPartId';
  tooLargeForSorter = 'tooLargeForSorter',
  tooLowConfidence = 'tooLowConfidence',
  noBinForPartId = 'noBinForPartId',
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

// Mocking a Detection object
const mockDetection: Detection = {
  id: 'det123',
  type: 'brick',
  confidence: 0.98,
  partId: '3001',
  imageURI: 'prime_model_image.jpg',
};

// Mocking a BrickognizeResponse object
const mockBrickognizeResponse: BrickognizeResponse = {
  id: 'resp123',
  type: 'brick',
  score: 0.95,
  name: '2x4 Brick',
  img_url: 'prime_model_image.jpg',
  external_sites: [],
  category: 'Basic Brick',
  bin: 5,
  sorter: 1,
};

// Mocking a ClassificationItem object
const mockClassificationItem: ClassificationItem = {
  type: 'brick',
  score: 1,
  id: '3001',
  name: '2x4 Brick',
  img_url: 'prime_model_image.jpg',
  external_sites: [],
  category: 'Basic Brick',
  bin: 5,
  sorter: 1,
};

// Creating a DetectionPairGroup with fake data
export const mockDetectionPairGroup: DetectionPairGroup = {
  id: 'group123',
  detectionPairs: [[mockDetection, mockDetection]],
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
