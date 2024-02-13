// sortProcessStore.ts
import { create } from 'zustand';
import { Detection, DetectionGroup, BrickognizeResponse } from '@/types/types';
import { DetectionPairGroup, DetectionPair } from '@/types/detectionPairs.type';

const MAX_DETECTION_GROUPS = 10;

interface SortProcessState {
  isRunning: boolean;
  setIsRunning: (isRunning: boolean) => void;
  // ---
  detectionPairGroups: DetectionPairGroup[];
  addDetectionPairGroup: (detectionPairGroup: DetectionPairGroup) => void;
  addDetectionPairToGroup: (groupId: string, detectionPair: DetectionPair) => void;

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
  detectionPairGroups: [],
  addDetectionPairGroup: (detectionPairGroup: DetectionPairGroup) =>
    set((state) => ({ detectionPairGroups: [detectionPairGroup, ...state.detectionPairGroups].slice(0, MAX_DETECTION_GROUPS) })),
  addDetectionPairToGroup: (groupId: string, detectionPair: DetectionPair) =>
    set((state) => {
      const groups = state.detectionPairGroups;
      // find the group with the given id
      const matchingGroup = groups.find((g) => g.id === groupId);
      if (matchingGroup) {
        matchingGroup.detectionPairs.push(detectionPair);
      }
      return { detectionPairGroups: [...groups] };
    }),

  // ---
  videoCaptureDimensions: { width: 0, height: 0 },
  setVideoCaptureDimensions: (width: number, height: number) => set({ videoCaptureDimensions: { width, height } }),
  videoStreamId: '',
  setVideoStreamId: (id: string) => set({ videoStreamId: id }),
}));
