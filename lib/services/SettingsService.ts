// lib/services/SettingsService.ts

import { Service, ServiceState } from './Service.interface';
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
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
            const result = settingsSchema.parse(data);
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

  getSettings(): SettingsType {
    if (this.settings) {
      return this.settings;
    }
    throw new Error('Settings not loaded');
  }
}

const settingsService = new SettingsService();
export default settingsService;
