// lib/services/Service.interface.ts

// services/Service.interface.ts

export type Service = {
  init(): Promise<void>;
  getStatus(): ServiceState;
};

export enum ServiceState {
  UNINITIALIZED,
  INITIALIZING,
  INITIALIZED,
  FAILED,
}

export enum ServiceName {
  SETTINGS = 'settings',
  SOCKET = 'socket',
  CLASSIFIER = 'classifier',
  HARDWARE = 'hardware',
  VIDEO_CAPTURE = 'videoCapture',
  DETECTOR = 'detector',
  SORTER = 'sorter',
}
