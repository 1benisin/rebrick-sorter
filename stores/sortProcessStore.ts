// sortProcessStore.ts
import { create } from "zustand";

const MAX_DETECTION_IMAGES = 20;

interface SortProcessState {
  isRunning: boolean;
  setIsRunning: (isRunning: boolean) => void;
  // ---
  detectionImageURIs: string[];
  addDetectionImageURI: (url: string) => void;
}

export const sortProcessStore = create<SortProcessState>((set) => ({
  isRunning: false,
  setIsRunning: (isRunning: boolean) => set({ isRunning }),
  // ---
  detectionImageURIs: [],
  addDetectionImageURI: (url: string) =>
    set((state) => ({
      detectionImageURIs: [
        ...state.detectionImageURIs.slice(-MAX_DETECTION_IMAGES + 1),
        url,
      ],
    })),
}));
