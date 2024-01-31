// sortProcessStore.ts
import { create } from "zustand";

const MAX_DETECTION_IMAGES = 20;

interface SortProcessState {
  isRunning: boolean;
  setIsRunning: (isRunning: boolean) => void;
  // ---
  errors: string[];
  addError: (error: string) => void;
  clearErrors: () => void;
  clearError: (index: number) => void;
  // ---
  detectionImageURIs: string[];
  addDetectionImageURI: (url: string) => void;
}

export const sortProcessStore = create<SortProcessState>((set) => ({
  isRunning: false,
  setIsRunning: (isRunning: boolean) => set({ isRunning }),
  // ---
  errors: [],
  addError: (error: string) =>
    set((state) => ({ errors: [...state.errors, error] })),
  clearErrors: () => set({ errors: [] }),
  clearError: (index: number) =>
    set((state) => ({
      errors: state.errors.filter((_, i) => i !== index),
    })),
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
