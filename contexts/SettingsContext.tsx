// contexts/SettingsContext.tsx

'use client';

import React, { createContext, useEffect, useState, ReactNode } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { settingsSchema, SettingsType } from '@/types/settings.type';
import { LoadStatus } from '@/types/loadStatus.type';
import { alertStore } from '@/stores/alertStore';
import { sortProcessStore } from '@/stores/sortProcessStore';

type SettingsContextType = {
  settings: SettingsType | null;
  status: LoadStatus;
  loadSettings: () => Promise<void>;
  saveSettings: (state: SettingsType) => Promise<void>;
};

export const SettingsContext = createContext<SettingsContextType>({
  settings: null,
  status: LoadStatus.Loading,
  loadSettings: async () => {},
  saveSettings: async (_: SettingsType) => {},
});

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [status, setStatus] = useState<LoadStatus>(LoadStatus.Loading);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setStatus(LoadStatus.Loading);
    try {
      const docRef = doc(db, 'settings', process.env.NEXT_PUBLIC_USER as string);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        throw new Error('No settings document in DB!');
      }
      const data = docSnap.data();
      let result = settingsSchema.parse(data);

      // set default values for development environment
      if (process.env.NEXT_PUBLIC_ENVIRONMENT == 'DEV') {
        result.conveyorSpeed = 0.3;
        result.classificationThresholdPercentage = 1;
      }

      // set start conveyor speed in sortProcessStore
      sortProcessStore.getState().setConveyorSpeed(result.conveyorSpeed);

      setSettings(result);
      setStatus(LoadStatus.Loaded);
      console.log('SETTINGS LOADED');
    } catch (error) {
      setStatus(LoadStatus.Failed);
      console.error('Error fetching settings:', error);
    }
  };

  const saveSettings = async (state: SettingsType) => {
    try {
      const result = settingsSchema.parse(state);
      const docRef = doc(db, 'settings', process.env.NEXT_PUBLIC_USER as string);
      await setDoc(docRef, result, { merge: true });

      alertStore.getState().addAlert({
        type: 'update',
        message: 'Settings saved successfully',
        timestamp: Date.now(),
      });
    } catch (error) {
      alertStore.getState().addAlert({
        type: 'error',
        message: 'Failed to save settings',
        timestamp: Date.now(),
      });
      console.error('Error saving settings:', error);
    }
  };

  return (
    <SettingsContext.Provider value={{ settings, status, loadSettings, saveSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};
