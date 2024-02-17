// Import necessary hooks and Firebase functions
import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/services/firestore';
import { settingsFormSchema, SettingsFormType } from '@/types/settingsForm.type';
import { alertStore } from '@/stores/alertStore';

const useSettings = () => {
  const [settings, setSettings] = useState<SettingsFormType | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const docRef = doc(db, 'settings', process.env.NEXT_PUBLIC_USER as string);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        const result = settingsFormSchema.parse(data);

        setSettings(result);
      } else {
        console.log('No settings document in DB!');
      }
    } catch (error) {
      alertStore.getState().addAlert({
        type: 'error',
        message: 'Failed to fetch settings',
        timestamp: Date.now(),
      });

      console.error('Error fetching settings:', error);
    }
  };

  const saveSettings = async (state: SettingsFormType) => {
    try {
      const result = settingsFormSchema.parse(state);

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

  return { loadSettings, saveSettings, settings };
};

export default useSettings;
