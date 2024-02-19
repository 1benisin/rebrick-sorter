// settingsStore.ts

import { create } from 'zustand';
import { db } from '@/services/firebase';
import { SettingsType, settingsSchema } from '@/types/settings.type';
import { alertStore } from './alertStore';
import { doc, getDoc, setDoc } from 'firebase/firestore';

interface SettingsState {
  settings: SettingsType;
  loaded: boolean; // To track if settings have been loaded from DB
  fetchSettings: () => Promise<void>;
  saved: boolean; // To track if settings have been saved to DB
  saveSettings: () => Promise<void>;
}

export const settingsStore = create<SettingsState>((set, get) => ({
  settings: settingsSchema.parse({}), // Initial state is default settings
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
