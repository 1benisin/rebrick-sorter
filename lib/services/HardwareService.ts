// lib/services/HardwareService.ts

import { Service, ServiceName, ServiceState } from './Service.interface';
import { HardwareInitDto } from '@/types/hardwareInit.dto';
import { SocketAction } from '@/types/socketMessage.type';
import { SerialPortName } from '@/types/serialPort.type';
import serviceManager from './ServiceManager';

class HardwareService implements Service {
  private status: ServiceState = ServiceState.UNINITIALIZED;

  constructor() {}

  async init(): Promise<void> {
    try {
      this.status = ServiceState.INITIALIZING;
      const settingsService = serviceManager.getService(ServiceName.SETTINGS);
      const settings = await settingsService.fetchSettings();
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

      const hardwareSettings: HardwareInitDto = {
        defaultConveyorSpeed: settings.conveyorSpeed,
        serialPorts: [
          ...settings.sorters.map((sorter) => ({
            name: sorter.name as SerialPortName,
            path: sorter.serialPort,
          })),
          { name: 'conveyor_jets' as SerialPortName, path: settings.conveyorJetsSerialPort },
          { name: 'hopper_feeder' as SerialPortName, path: settings.hopperFeederSerialPort },
        ],
        sorterDimensions: settings.sorters.map((sorter) => ({
          gridWidth: sorter.gridWidth,
          gridHeight: sorter.gridHeight,
        })),
        jetPositions: settings.sorters.map((sorter) => sorter.jetPosition),
      };

      socket.on(SocketAction.INIT_HARDWARE_SUCCESS, (success) => {
        if (success) {
          this.status = ServiceState.INITIALIZED;
        } else {
          this.status = ServiceState.FAILED;
        }
      });

      socket.emit(SocketAction.INIT_HARDWARE, hardwareSettings);
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
