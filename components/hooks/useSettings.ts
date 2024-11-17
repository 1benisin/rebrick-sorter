// hooks/useSettings.ts

import { useState, useEffect, useCallback } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { settingsSchema, SettingsType } from '@/types/settings.type';

type UseSettingsReturn = {
  settings: SettingsType | null;
  isLoading: boolean;
  error: string | null;
  saveSettings: (newSettings: SettingsType) => Promise<void>;
};

export function useSettings(): UseSettingsReturn {
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const userId = process.env.NEXT_PUBLIC_USER;
    if (!userId) {
      setError('User ID is not set');
      setIsLoading(false);
      return;
    }

    const settingsRef = doc(db, 'settings', userId);

    const unsubscribe = onSnapshot(
      settingsRef,
      (docSnapshot) => {
        if (docSnapshot.exists()) {
          try {
            const data = docSnapshot.data();
            let result = settingsSchema.parse(data);

            setSettings(result);
            setError(null);
          } catch (error) {
            console.error('Error parsing settings:', error);
            setError('Failed to parse settings');
          }
        } else {
          setError('No settings document found');
        }
        setIsLoading(false);
      },
      (err) => {
        console.error('Error fetching settings:', err);
        setError('Failed to fetch settings');
        setIsLoading(false);
      },
    );

    // Cleanup function to unsubscribe from Firestore when the component unmounts
    return () => unsubscribe();
  }, []);

  const saveSettings = useCallback(async (newSettings: SettingsType) => {
    const userId = process.env.NEXT_PUBLIC_USER;
    if (!userId) {
      throw new Error('User ID is not set');
    }

    try {
      const result = settingsSchema.parse(newSettings);
      const settingsRef = doc(db, 'settings', userId);
      await setDoc(settingsRef, result, { merge: true });
      // Note: We don't need to manually update the state here as the onSnapshot listener will handle that
    } catch (error) {
      console.error('Error saving settings:', error);
      throw new Error('Failed to save settings');
    }
  }, []);

  return {
    settings,
    isLoading,
    error,
    saveSettings,
  };
}
