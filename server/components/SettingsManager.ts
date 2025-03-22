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

  public registerSettingsUpdateCallback(callback: (settings: SettingsType) => Promise<void>): void {
    this.settingsUpdateCallbacks.push(callback);
  }

  public unregisterSettingsUpdateCallback(callback: (settings: SettingsType) => Promise<void>): void {
    this.settingsUpdateCallbacks = this.settingsUpdateCallbacks.filter((cb) => cb !== callback);
  }

  private async notifySettingsUpdateCallbacks(settings: SettingsType): Promise<void> {
    for (const callback of this.settingsUpdateCallbacks) {
      try {
        await callback(settings);
      } catch (error) {
        console.error('Error in settings update callback:', error);
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
      // Get initial settings
      const snapshot = await this.settingsRef.get();
      if (snapshot.exists) {
        const settingsData = snapshot.data();
        if (settingsData) {
          const settings = settingsSchema.parse(settingsData);
          this.settings = settings;
          this.socketManager.emitSettingsUpdate(settings);
          await this.notifySettingsUpdateCallbacks(settings);
        }
      }

      // Set up real-time listener
      this.settingsRef.onSnapshot(
        async (snapshot) => {
          if (snapshot.exists) {
            const settingsData = snapshot.data();
            if (settingsData) {
              try {
                const settings = settingsSchema.parse(settingsData);
                this.settings = settings;
                this.socketManager.emitSettingsUpdate(settings);
                await this.notifySettingsUpdateCallbacks(settings);
              } catch (error) {
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
