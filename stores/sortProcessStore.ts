// sortProcessStore.ts
import { create } from 'zustand';
import { Detection, DetectionGroup, BrickognizeResponse } from '@/types';

const MAX_DETECTION_IMAGES = 20;
const MAX_DETECTION_GROUPS = 10;

interface SortProcessState {
  isRunning: boolean;
  setIsRunning: (isRunning: boolean) => void;
  // ---
  detectionImageURIs: string[];
  addDetectionImageURI: (url: string) => void;

  // ---
  topViewDetectGroups: DetectionGroup[];
  sideViewDetectGroups: DetectionGroup[];
  newDetectGroup: (group: 'top' | 'side', detectionGroup: DetectionGroup) => void;
  clearDetectionGroups: () => void;
  addDetectionToGroup: (group: 'top' | 'side', index: string, detection: Detection) => void;
  addClassificationToGroup: (group: 'top' | 'side', index: string, classification: BrickognizeResponse, indexUsedToClassify: number) => void;

  // ---
  videoCaptureDimensions: { width: number; height: number };
  setVideoCaptureDimensions: (width: number, height: number) => void;
  videoStreamId: string;
  setVideoStreamId: (id: string) => void;
}

export const sortProcessStore = create<SortProcessState>((set) => ({
  isRunning: false,
  setIsRunning: (isRunning: boolean) => set({ isRunning }),
  // ---
  detectionImageURIs: [],
  addDetectionImageURI: (url: string) =>
    set((state) => ({
      detectionImageURIs: [...state.detectionImageURIs.slice(-MAX_DETECTION_IMAGES + 1), url],
    })),

  // --- Detection Groups
  topViewDetectGroups: [],
  sideViewDetectGroups: [],
  newDetectGroup: (group: 'top' | 'side', detectionGroup: DetectionGroup) =>
    set((state) => {
      const key = `${group}ViewDetectGroups` as keyof SortProcessState; // Assert that the key is a valid key of SortProcessState
      const groups = state[key] as DetectionGroup[]; // Assert the type of the state property
      return { [key]: [detectionGroup, ...groups].slice(0, MAX_DETECTION_GROUPS) };
    }),
  clearDetectionGroups: () => set({ topViewDetectGroups: [], sideViewDetectGroups: [] }),
  addDetectionToGroup: (group: 'top' | 'side', groupId: string, detection: Detection) =>
    set((state) => {
      const key = `${group}ViewDetectGroups` as keyof SortProcessState;
      const groups = state[key] as DetectionGroup[];
      // find the group with the given id
      const matchingGroup = groups.find((g) => g.id === groupId);
      if (matchingGroup) {
        matchingGroup.detections.push(detection);
      }
      return { [key]: [...groups] };
    }),
  addClassificationToGroup: (group: 'top' | 'side', groupId: string, classification: BrickognizeResponse, indexUsedToClassify: number) =>
    set((state) => {
      const key = `${group}ViewDetectGroups` as keyof SortProcessState;
      const groups = state[key] as DetectionGroup[];
      // find the group with the given id
      const matchingGroup = groups.find((g) => g.id === groupId);
      if (matchingGroup) {
        matchingGroup.classification = classification;
        matchingGroup.indexUsedToClassify = indexUsedToClassify;
      }
      return { [key]: [...groups] };
    }),

  // ---
  videoCaptureDimensions: { width: 0, height: 0 },
  setVideoCaptureDimensions: (width: number, height: number) => set({ videoCaptureDimensions: { width, height } }),
  videoStreamId: '',
  setVideoStreamId: (id: string) => set({ videoStreamId: id }),
}));
