import { adminDb } from '../firebase-admin';
import { BaseComponent, ComponentConfig, ComponentStatus } from './BaseComponent';
import { SettingsType, settingsSchema } from '../../types/settings.type';
import { SocketManager } from './SocketManager';

export interface SettingsManagerConfig extends ComponentConfig {
  socketManager: SocketManager;
}

export class SettingsManager extends BaseComponent {
  private settings: SettingsType | null = null;
  private socketManager: SocketManager;
  private settingsRef: FirebaseFirestore.DocumentReference;
  private settingsUpdateCallbacks: ((settings: SettingsType) => Promise<void>)[] = [];

  constructor(socketManager: SocketManager) {
    super('SettingsManager');
    this.socketManager = socketManager;
    this.settingsRef = adminDb.collection('settings').doc('dev-user');
  }

  public getSettings(): SettingsType | null {
    return this.settings;
  }

  /**
   * Updates settings in Firebase. Used for server-side calibration operations.
   * @param updates - Partial settings object to merge with existing settings
   * @returns Promise that resolves when settings are updated
   */
  public async updateSettings(updates: Partial<SettingsType>): Promise<void> {
    try {
      await this.settingsRef.set(updates, { merge: true });
      console.log('[SETTINGS] Settings updated from server:', Object.keys(updates));
    } catch (error) {
      console.error('[SETTINGS] Error updating settings:', error);
      throw error;
    }
  }

  public registerSettingsUpdateCallback(callback: (settings: SettingsType) => Promise<void>): void {
    console.log(
      `\x1b[32m[SETTINGS_FLOW] Callback registered. Total callbacks: ${this.settingsUpdateCallbacks.length + 1}\x1b[0m`,
    );
    this.settingsUpdateCallbacks.push(callback);
  }

  public unregisterSettingsUpdateCallback(callback: (settings: SettingsType) => Promise<void>): void {
    this.settingsUpdateCallbacks = this.settingsUpdateCallbacks.filter((cb) => cb !== callback);
  }

  private async notifySettingsUpdateCallbacks(settings: SettingsType): Promise<void> {
    console.log(
      `\x1b[32m[SETTINGS_FLOW] Notifying ${this.settingsUpdateCallbacks.length} callback(s) of settings update\x1b[0m`,
    );
    for (const callback of this.settingsUpdateCallbacks) {
      try {
        console.log('\x1b[32m[SETTINGS_FLOW] Calling callback...\x1b[0m');
        await callback(settings);
        console.log('\x1b[32m[SETTINGS_FLOW] Callback completed successfully\x1b[0m');
      } catch (error) {
        console.error('\x1b[33m[SETTINGS_FLOW] Error in settings update callback:\x1b[0m', error);
      }
    }
  }

  public async initialize(): Promise<void> {
    try {
      this.setStatus(ComponentStatus.INITIALIZING);
      await this.subscribeToSettings();
      this.setStatus(ComponentStatus.READY);
    } catch (error) {
      this.setError(error instanceof Error ? error.message : 'Unknown error initializing settings');
    }
  }

  public async reinitialize(config: SettingsManagerConfig): Promise<void> {
    await this.deinitialize();
    await this.initialize();
  }

  public async deinitialize(): Promise<void> {
    this.settings = null;
    this.settingsUpdateCallbacks = [];
    this.setStatus(ComponentStatus.UNINITIALIZED);
  }

  private async subscribeToSettings(): Promise<void> {
    try {
      console.log('\x1b[32m[SETTINGS_FLOW] Setting up Firebase subscription...\x1b[0m');
      // Get initial settings
      const snapshot = await this.settingsRef.get();
      if (snapshot.exists) {
        console.log('\x1b[32m[SETTINGS_FLOW] Initial settings loaded from Firebase\x1b[0m');
        const settingsData = snapshot.data();
        if (settingsData) {
          const settings = settingsSchema.parse(settingsData);
          this.settings = settings;
          console.log('\x1b[32m[SETTINGS_FLOW] Notifying callbacks with initial settings\x1b[0m');
          await this.notifySettingsUpdateCallbacks(settings);
        }
      }

      // Set up real-time listener
      this.settingsRef.onSnapshot(
        async (snapshot: FirebaseFirestore.DocumentSnapshot) => {
          console.log('\x1b[32m[SETTINGS_FLOW] Firebase snapshot received\x1b[0m');
          if (snapshot.exists) {
            const settingsData = snapshot.data();
            if (settingsData) {
              try {
                const settings = settingsSchema.parse(settingsData);
                // Only notify if settings actually changed
                const oldSettingsStr = JSON.stringify(this.settings);
                const newSettingsStr = JSON.stringify(settings);
                if (newSettingsStr !== oldSettingsStr) {
                  console.log('\x1b[32m[SETTINGS_FLOW] Settings changed detected in Firebase\x1b[0m');
                  this.settings = settings;
                  await this.notifySettingsUpdateCallbacks(settings);
                } else {
                  console.log('\x1b[33m[SETTINGS_FLOW] Settings unchanged, skipping callback notification\x1b[0m');
                }
              } catch (error) {
                console.error('\x1b[31m[SETTINGS_FLOW] Error processing settings update:\x1b[0m', error);
                this.setError(error instanceof Error ? error.message : 'Error processing settings update');
              }
            }
          }
        },
        (error) => {
          this.setError(error instanceof Error ? error.message : 'Error subscribing to settings');
        },
      );
    } catch (error) {
      this.setError(error instanceof Error ? error.message : 'Error initializing settings subscription');
    }
  }

  protected notifyStatusChange(): void {
    this.socketManager.emitComponentStatusUpdate(this.getName(), this.getStatus(), this.getError());
  }
}
