// lib/services/HardwareService.ts

import { Service, ServiceName, ServiceState } from './Service.interface';
import { HardwareInitDto } from '@/types/hardwareInit.dto';
import { SerialPortName } from '@/types/serialPort.type';
import serviceManager from './ServiceManager';
import { AllEvents } from '@/types/socketMessage.type';

class HardwareService implements Service {
  private status: ServiceState = ServiceState.UNINITIALIZED;

  constructor() {}

  async init(): Promise<void> {
    try {
      this.status = ServiceState.INITIALIZING;
      const settingsService = serviceManager.getService(ServiceName.SETTINGS);
      const settings = settingsService.getSettings();
      const socketService = serviceManager.getService(ServiceName.SOCKET);
      const socket = socketService.getSocket();

      if (
        settingsService.getStatus() !== ServiceState.INITIALIZED ||
        socketService.getStatus() !== ServiceState.INITIALIZED ||
        !settings ||
        !socket
      ) {
        this.status = ServiceState.UNINITIALIZED;
        return;
      }

      socket.on(AllEvents.INIT_HARDWARE_SUCCESS, (success) => {
        if (success) {
          this.status = ServiceState.INITIALIZED;
        } else {
          this.status = ServiceState.FAILED;
        }
      });
    } catch (error) {
      this.status = ServiceState.FAILED;
      console.error('Error initializing hardware:', error);
      throw error;
    }
  }

  getStatus(): ServiceState {
    return this.status;
  }
}

const hardwareService = new HardwareService();
export default hardwareService;
