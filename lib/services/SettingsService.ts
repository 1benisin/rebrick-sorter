// lib/services/SettingsService.ts

import { Service, ServiceState } from './Service.interface';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { settingsSchema, SettingsType } from '@/types/settings.type';
import { z } from 'zod';

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
      await this.fetchSettings();
      this.state = ServiceState.INITIALIZED;
    } catch (error) {
      this.state = ServiceState.FAILED;
      throw error;
    }
  }

  getStatus(): ServiceState {
    return this.state;
  }

  async saveSettings(newSettings: SettingsType): Promise<void> {
    if (!this.userId) {
      throw new Error('User ID is not set');
    }

    try {
      const result = settingsSchema.parse(newSettings);
      const settingsRef = doc(db, 'settings', this.userId);
      await setDoc(settingsRef, result, { merge: true });
      this.settings = result;
    } catch (error) {
      console.error('Error saving settings:', error);
      throw new Error('Failed to save settings');
    }
  }

  getStaleSettings(): SettingsType {
    if (this.settings) {
      return this.settings;
    }
    throw new Error('Settings not loaded');
  }

  async fetchSettings(): Promise<SettingsType> {
    try {
      if (!this.userId) {
        throw new Error('User ID is not set');
      }

      const settingsRef = doc(db, 'settings', this.userId);
      const docSnapshot = await getDoc(settingsRef);

      if (docSnapshot.exists()) {
        const data = docSnapshot.data();

        const result = settingsSchema.parse(data);

        this.settings = result;
        return result;
      }
      throw new Error('Settings not found');
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error('---Error parsing settings:', error);
        throw new Error('Failed to parse settings');
      } else {
        console.error('Error fetching settings:', error);
        throw new Error('Failed to fetch settings');
      }
    }
  }
}

const settingsService = new SettingsService();
export default settingsService;
