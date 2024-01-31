// sortProcessStore.ts
import { create } from "zustand";

interface SortProcessState {
  isRunning: boolean;
  errors: string[];
  setIsRunning: (isRunning: boolean) => void;
  addError: (error: string) => void;
  clearErrors: () => void;
  clearError: (index: number) => void;
}

export const sortProcessStore = create<SortProcessState>((set) => ({
  isRunning: false,
  errors: [],
  setIsRunning: (isRunning: boolean) => set({ isRunning }),
  addError: (error: string) =>
    set((state) => ({ errors: [...state.errors, error] })),
  clearErrors: () => set({ errors: [] }),
  clearError: (index: number) =>
    set((state) => ({
      errors: state.errors.filter((_, i) => i !== index),
    })),
}));
