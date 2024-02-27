import { useContext } from 'react';
import { SettingsContext } from '@/contexts/SettingsContext';

const useSettings = () => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};

export default useSettings;

// // Import necessary hooks and Firebase functions
// 'use client';
// import { useState, useEffect } from 'react';
// import { doc, getDoc, setDoc } from 'firebase/firestore';
// import { db } from '@/services/firebase';
// import { settingsSchema, SettingsType } from '@/types/settings.type';
// import { alertStore } from '@/stores/alertStore';

// enum LoadStatus {
//   Loading = 'loading',
//   Loaded = 'loaded',
//   Failed = 'failed',
// }

// const useSettings = () => {
//   // settings can be null, so we use the type assertion to tell TypeScript that it's not null
//   const [settings, setSettings] = useState<SettingsType | null>(null);
//   const [status, setStatus] = useState<LoadStatus>(LoadStatus.Loading);

//   useEffect(() => {
//     loadSettings();
//   }, []);

//   const loadSettings = async () => {
//     console.log('Loading settings...');
//     setStatus(LoadStatus.Loading);
//     try {
//       const docRef = doc(db, 'settings', process.env.NEXT_PUBLIC_USER as string);
//       const docSnap = await getDoc(docRef);

//       if (!docSnap.exists()) throw new Error('No settings document in DB!');
//       const data = docSnap.data();
//       const result = settingsSchema.parse(data);

//       setSettings(result);
//       setStatus(LoadStatus.Loaded);
//     } catch (error) {
//       setStatus(LoadStatus.Failed);
//       console.error('Error fetching settings:', error);
//     }
//   };

//   const saveSettings = async (state: SettingsType) => {
//     try {
//       const result = settingsSchema.parse(state);

//       const docRef = doc(db, 'settings', process.env.NEXT_PUBLIC_USER as string);
//       await setDoc(docRef, result, { merge: true });

//       // Assuming you have a global alert store or a way to show notifications
//       alertStore.getState().addAlert({
//         type: 'update',
//         message: 'Settings saved successfully',
//         timestamp: Date.now(),
//       });
//     } catch (error) {
//       alertStore.getState().addAlert({
//         type: 'error',
//         message: 'Failed to save settings',
//         timestamp: Date.now(),
//       });
//       console.error('Error saving settings:', error);
//     }
//   };

//   return { loadSettings, saveSettings, settings, status };
// };

// export default useSettings;
