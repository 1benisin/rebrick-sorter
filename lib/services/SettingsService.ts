// lib/services/SettingsService.ts

import { Service, ServiceState } from './Service.interface';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { settingsSchema, SettingsType } from '@/types/settings.type';

class SettingsService implements Service {
  private state: ServiceState = ServiceState.UNINITIALIZED;
  private settings: SettingsType | null = null;
  private userId: string | null = null;

  constructor() {
    this.userId = process.env.NEXT_PUBLIC_USER || null;
  }

  async init(): Promise<void> {
    this.state = ServiceState.INITIALIZING;

    if (!this.userId) {
      this.state = ServiceState.FAILED;
      return;
    }

    try {
      this.setupSettingsListener();
      this.state = ServiceState.INITIALIZED;
    } catch (error) {
      this.state = ServiceState.FAILED;
      console.error('---Error initializing settings service:', error);
    }
  }

  private setupSettingsListener(): void {
    if (!this.userId) {
      throw new Error('User ID is not set');
    }

    const settingsRef = doc(db, 'settings', this.userId);

    onSnapshot(
      settingsRef,
      (docSnapshot) => {
        if (docSnapshot.exists()) {
          try {
            const data = docSnapshot.data();
            const migratedData = this.migrateSettingsData(data);
            const result = settingsSchema.parse(migratedData);
            this.settings = result;
          } catch (error) {
            console.error('Error parsing settings:', error);
          }
        }
      },
      (error) => {
        console.error('Error fetching settings from DB:', error);
      },
    );
  }

  private migrateSettingsData(data: any): any {
    // Handle migration from jetPositionEnd to jetDuration
    if (data.sorters && Array.isArray(data.sorters)) {
      data.sorters = data.sorters.map((sorter: any) => {
        if (sorter.jetPositionEnd !== undefined && sorter.jetDuration === undefined) {
          // Convert from end position to duration
          const start = sorter.jetPositionStart || 0;
          const end = sorter.jetPositionEnd;
          sorter.jetDuration = Math.max(1, end - start);
          delete sorter.jetPositionEnd;
        }
        return sorter;
      });
    }
    return data;
  }

  getStatus(): ServiceState {
    return this.state;
  }

  async saveSettings(newSettings: SettingsType): Promise<void> {
    if (!this.userId) {
      throw new Error('User ID is not set');
    }

    try {
      console.log('\x1b[32m[SETTINGS_FLOW] Client: saveSettings called\x1b[0m');
      const result = settingsSchema.parse(newSettings);
      const settingsRef = doc(db, 'settings', this.userId);
      console.log('\x1b[32m[SETTINGS_FLOW] Client: Writing to Firebase...\x1b[0m');
      await setDoc(settingsRef, result, { merge: true });
      this.settings = result;
      console.log('\x1b[32m[SETTINGS_FLOW] Client: Settings saved to Firebase successfully\x1b[0m');
    } catch (error) {
      console.error('\x1b[31m[SETTINGS_FLOW] Client: Error saving settings:\x1b[0m', error);
      throw new Error('Failed to save settings');
    }
  }

  getSettings(): SettingsType {
    if (this.settings) {
      return this.settings;
    }
    throw new Error('Settings not loaded');
  }
}

const settingsService = new SettingsService();
export default settingsService;
