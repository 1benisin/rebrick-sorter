// settingsStore.ts

import { create } from "zustand";
import { Sorter } from "@/types";
import { db } from "@/services/firestore";
import { settingsSchema } from "@/types";
import { StateStorage } from "zustand/middleware";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteField,
} from "firebase/firestore";

interface SettingsState {
  // General settings
  loaded: boolean; // To track if settings have been loaded from DB
  fetchSettings: () => Promise<void>;
  saveSettings: () => Promise<void>;

  // Conveyor settings
  conveyorVelocity: number; // pixels per second
  setConveyorVelocity: (conveyorVelocity: number) => void;

  // Sorter settings
  sorters: Sorter[];
  addSorterAtIndex: (index: number) => void;
  removeSorterAtIndex: (index: number) => void;
  updateSorter: (index: number, sorter: Sorter) => void;
}

export const settingsStore = create<SettingsState>((set, get) => ({
  // General settings
  loaded: false, // Initial state is not loaded
  fetchSettings: async () => {
    if (get().loaded) return; // If already loaded, do nothing

    try {
      const docRef = doc(
        db,
        "settings",
        process.env.NEXT_PUBLIC_USER as string
      );
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        // validate the data
        const result = settingsSchema.safeParse(data);
        if (!result.success) {
          console.error("Error parsing settings data from DB:", result.error);
          return;
        }

        set({
          ...result.data,
          loaded: true,
        });
      } else {
        console.log("No settings document in DB!");
      }
    } catch (error) {
      console.error("Error fetching settings:", error);
    }
  },
  saveSettings: async () => {
    const { conveyorVelocity, sorters } = get();
    const result = settingsSchema.safeParse({ conveyorVelocity, sorters });
    if (!result.success) {
      console.error("Error parsing settings data on Save:", result.error);
      return;
    }

    try {
      const docRef = doc(
        db,
        "settings",
        process.env.NEXT_PUBLIC_USER as string
      );
      await setDoc(docRef, result.data, { merge: true });
    } catch (error) {
      console.error("Error saving settings:", error);
    }
  },

  // Conveyor settings
  conveyorVelocity: 100,
  setConveyorVelocity: (conveyorVelocity: number) => set({ conveyorVelocity }),

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
      return { sorters: newSorters };
    });
  },
  removeSorterAtIndex: (index: number) => {
    set((state) => {
      const newSorters = [...state.sorters];
      newSorters.splice(index, 1);
      return { sorters: newSorters };
    });
  },
  updateSorter: (index: number, sorter: Sorter) => {
    set((state) => {
      const newSorters = [...state.sorters];
      newSorters[index] = sorter;
      return { sorters: newSorters };
    });
  },
}));

// load settings from Firestore
settingsStore.getState().fetchSettings();

// Firestore storage used by Zustand to persist and rehydrate state
const firestoreStorage: StateStorage = {
  getItem: async (name: string) => {
    try {
      const docRef = doc(
        db,
        "settings",
        process.env.NEXT_PUBLIC_USER as string
      );
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        return JSON.stringify(data[name]);
      } else {
        console.log("No such document!");
        return null;
      }
    } catch (error) {
      console.error("Error fetching settings from Firestore:", error);
      throw error;
    }
  },
  setItem: async (name: string, value: string) => {
    try {
      const data = JSON.parse(value);
      const docRef = doc(
        db,
        "settings",
        process.env.NEXT_PUBLIC_USER as string
      );
      await setDoc(docRef, { [name]: data }, { merge: true });
    } catch (error) {
      console.error("Error setting settings to Firestore:", error);
      throw error;
    }
  },
  removeItem: async (name: string) => {
    try {
      const docRef = doc(
        db,
        "settings",
        process.env.NEXT_PUBLIC_USER as string
      );
      await updateDoc(docRef, {
        [name]: deleteField(),
      });
    } catch (error) {
      console.error("Error removing settings from Firestore:", error);
      throw error;
    }
  },
};
