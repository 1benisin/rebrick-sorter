// Import necessary hooks and Firebase functions
import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { settingsSchema, SettingsType } from '@/types/settings.type';
import { alertStore } from '@/stores/alertStore';

const useSettings = () => {
  // settings can be null, so we use the type assertion to tell TypeScript that it's not null
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const docRef = doc(db, 'settings', process.env.NEXT_PUBLIC_USER as string);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) throw new Error('No settings document in DB!');
      const data = docSnap.data();
      const result = settingsSchema.parse(data);

      setSettings(result);
      setLoaded(true);
    } catch (error) {
      alertStore.getState().addAlert({
        type: 'error',
        message: 'Failed to fetch settings',
        timestamp: Date.now(),
      });

      console.error('Error fetching settings:', error);
    }
  };

  const saveSettings = async (state: SettingsType) => {
    try {
      const result = settingsSchema.parse(state);

      const docRef = doc(db, 'settings', process.env.NEXT_PUBLIC_USER as string);
      await setDoc(docRef, result, { merge: true });

      // Assuming you have a global alert store or a way to show notifications
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

  return { loaded, loadSettings, saveSettings, settings };
};

export default useSettings;
