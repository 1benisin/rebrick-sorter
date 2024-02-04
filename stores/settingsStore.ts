// settingsStore.ts

import { create } from 'zustand';
import { Sorter } from '@/types';
import { db } from '@/services/firestore';
import { settingsSchema } from '@/types';
import { alertStore } from './alertStore';
import { doc, getDoc, setDoc } from 'firebase/firestore';

interface SettingsState {
  // Conveyor settings
  conveyorSpeed_PPS: number; // pixels per second
  setConveyorSpeed_PPS: (conveyorSpeed_PPS: number) => void;
  detectDistanceThreshold: number; // pixels
  setDetectDistanceThreshold: (detectDistanceThreshold: number) => void;

  // Sorter settings
  sorters: Sorter[];
  addSorterAtIndex: (index: number) => void;
  removeSorterAtIndex: (index: number) => void;
  updateSorter: (index: number, sorter: Sorter) => void;

  // General settings
  loaded: boolean; // To track if settings have been loaded from DB
  fetchSettings: () => Promise<void>;
  saved: boolean; // To track if settings have been saved to DB
  saveSettings: () => Promise<void>;
}

export const settingsStore = create<SettingsState>((set, get) => ({
  // Conveyor settings
  conveyorSpeed_PPS: 0,
  setConveyorSpeed_PPS: (conveyorSpeed_PPS: number) => set({ conveyorSpeed_PPS, saved: false }),
  detectDistanceThreshold: 0,
  setDetectDistanceThreshold: (detectDistanceThreshold: number) => set({ detectDistanceThreshold, saved: false }),

  // Sorter settings
  sorters: [],
  addSorterAtIndex: (index: number) => {
    set((state) => {
      const newSorters = [...state.sorters];
      newSorters.splice(index, 0, {
        name: Math.random().toString(36).substring(7),
        gridDimensions: { width: 10, height: 10 },
        airJetPosition: 0,
        maxPartDimension: 10,
      });
      return { sorters: newSorters, saved: false };
    });
  },
  removeSorterAtIndex: (index: number) => {
    set((state) => {
      const newSorters = [...state.sorters];
      newSorters.splice(index, 1);
      return { sorters: newSorters, saved: false };
    });
  },
  updateSorter: (index: number, sorter: Sorter) => {
    set((state) => {
      const newSorters = [...state.sorters];
      newSorters[index] = sorter;
      return { sorters: newSorters, saved: false };
    });
  },

  // General settings
  loaded: false, // Initial state is not loaded
  fetchSettings: async () => {
    if (get().loaded) return; // If already loaded, do nothing

    try {
      const docRef = doc(db, 'settings', process.env.NEXT_PUBLIC_USER as string);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        // validate the data
        const result = settingsSchema.safeParse(data);
        if (!result.success) {
          console.error('Error parsing settings data from DB:', result.error);
          return;
        }
        set({
          ...result.data,
          loaded: true,
        });
      } else {
        console.log('No settings document in DB!');
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  },
  saved: true,
  saveSettings: async () => {
    // just get conveyorSpeed_PPS, sorters, detectDistanceThreshold from state and save to DB
    const state = get();
    const result = settingsSchema.safeParse(state);

    if (!result.success) {
      console.error('Error parsing settings data on Save:', result.error);
      return;
    }

    try {
      const docRef = doc(db, 'settings', process.env.NEXT_PUBLIC_USER as string);
      await setDoc(docRef, result.data, { merge: true });
      set({ saved: true });
      alertStore.getState().addAlert({
        type: 'update',
        message: 'Settings saved successfully',
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  },
}));

// load settings from Firestore
settingsStore.getState().fetchSettings();
