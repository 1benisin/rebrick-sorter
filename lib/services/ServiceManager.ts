// lib/services/ServiceManager.ts

// services/ServiceManager.ts

import settingsService from '@/lib/services/SettingsService';
import socketService from '@/lib/services/SocketService';
import classifierService from '@/lib/services/ClassifierService';
import hardwareService from '@/lib/services/HardwareService';
import videoCaptureService from '@/lib/services/VideoCaptureService';
import DetectorService from '@/lib/services/DetectorService';
import SorterService from '@/lib/services/SorterService';
import { Service, ServiceName, ServiceState } from './Service.interface';

export type ServiceType = {
  [ServiceName.SETTINGS]: typeof settingsService;
  [ServiceName.SOCKET]: typeof socketService;
  [ServiceName.CLASSIFIER]: typeof classifierService;
  [ServiceName.HARDWARE]: typeof hardwareService;
  [ServiceName.VIDEO_CAPTURE]: typeof videoCaptureService;
  [ServiceName.DETECTOR]: typeof DetectorService;
  [ServiceName.SORTER]: typeof SorterService;
};

type ServiceConfig = {
  [K in keyof ServiceType]: {
    name: K;
    service: ServiceType[K];
  };
}[keyof ServiceType];

const serviceConfigs: ServiceConfig[] = [
  { name: ServiceName.SETTINGS, service: settingsService },
  { name: ServiceName.SOCKET, service: socketService },
  { name: ServiceName.CLASSIFIER, service: classifierService },
  { name: ServiceName.HARDWARE, service: hardwareService },
  { name: ServiceName.VIDEO_CAPTURE, service: videoCaptureService },
  { name: ServiceName.DETECTOR, service: DetectorService },
  { name: ServiceName.SORTER, service: SorterService },
];

class ServiceManager {
  private services: Map<ServiceName, Service> = new Map();

  constructor() {
    // add all services to the map
    for (const config of serviceConfigs) {
      this.services.set(config.name, config.service);
    }
  }

  async initializeAll() {
    for (const config of serviceConfigs) {
      try {
        await config.service.init();
      } catch (error) {
        console.error(`---Failed to initialize ${config.name}:`, error);
      }
    }
  }

  getService<K extends keyof ServiceType>(serviceName: K): ServiceType[K] {
    const service = this.services.get(serviceName) as ServiceType[K];
    if (!service) {
      throw new Error(`Service ${serviceName} not found or not initialized`);
    }
    return service;
  }

  getServiceState<K extends keyof ServiceType>(serviceName: K): ServiceState {
    const service = this.services.get(serviceName) as ServiceType[K];
    if (!service) {
      throw new Error(`Service ${serviceName} not found or not initialized`);
    }
    return service.getStatus();
  }
}

// Create and export a single instance of ServiceManager
const serviceManager = new ServiceManager();
export default serviceManager;
