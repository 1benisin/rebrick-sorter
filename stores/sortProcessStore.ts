// sortProcessStore.ts
import { create } from "zustand";
import { Detection } from "@/types";

const MAX_DETECTION_IMAGES = 20;

interface SortProcessState {
  isRunning: boolean;
  setIsRunning: (isRunning: boolean) => void;
  // ---
  detectionImageURIs: string[];
  addDetectionImageURI: (url: string) => void;

  // ---
  topViewDetectGroups: Detection[][];
  sideViewDetectGroups: Detection[][];
  newDetectGroup: (group: "top" | "side", detectionGroup: Detection[]) => void;
  addDetectionGroup: (
    group: "top" | "side",
    index: number,
    detection: Detection
  ) => void;
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

  // --- Detection Groups
  topViewDetectGroups: [],
  sideViewDetectGroups: [],
  newDetectGroup: (group: "top" | "side", detectionGroup: Detection[]) =>
    set((state) => {
      const key = `${group}ViewDetectGroups` as keyof SortProcessState; // Assert that the key is a valid key of SortProcessState
      const groups = state[key] as Detection[][]; // Assert the type of the state property
      return { ...state, [key]: [...groups, detectionGroup] };
    }),
  addDetectionGroup: (
    group: "top" | "side",
    index: number,
    detection: Detection
  ) =>
    set((state) => {
      const key = `${group}ViewDetectGroups` as keyof SortProcessState;
      const groups = state[key] as Detection[][];
      groups[index].push(detection);
      return { ...state, [key]: [...groups] };
    }),
}));
