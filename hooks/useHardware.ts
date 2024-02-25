// Import necessary hooks and Firebase functions
'use client';
import { useState, useEffect } from 'react';
import axios from 'axios';
import { HardwareInitDto } from '@/types/hardwareInit.dto';
import useSettings from './useSettings';
import { serialPortNames } from '@/types/serialPort.type';
import { useSocket } from '@/components/providers/socketProvider';
import { SocketAction, SocketMessage } from '@/types/socketMessage.type';

enum LoadStatus {
  Loading = 'loading',
  Loaded = 'loaded',
  Failed = 'failed',
}

const useHardware = () => {
  const [status, setStatus] = useState<LoadStatus>(LoadStatus.Loading);
  const { settings } = useSettings();
  const { socket, isConnected: isSocketConnected } = useSocket();

  useEffect(() => {
    const initHardware = async () => {
      console.log('Initializing Hardware...');
      try {
        if (!settings || !isSocketConnected || !socket) {
          return;
        }

        setStatus(LoadStatus.Loading);

        // create serial port list
        const serialPorts = settings.sorters.map((sorter) => ({ name: sorter.name, path: sorter.serialPort }));
        serialPorts.push({ name: serialPortNames.conveyor_jets, path: settings.conveyorJetsSerialPort });
        serialPorts.push({ name: serialPortNames.hopper_feeder, path: settings.hopperFeederSerialPort });

        // create jet positions
        const jetPositions = settings.sorters.map((sorter) => sorter.jetPosition);

        // cre
        const sorterDimensions = settings.sorters.map((sorter) => ({ gridWidth: sorter.gridWidth, gridHeight: sorter.gridHeight }));

        const hardwareSettings: HardwareInitDto = {
          defaultConveyorSpeed_PPS: settings.conveyorSpeed_PPS,
          serialPorts: serialPorts,
          sorterDimensions: sorterDimensions,
          jetPositions: jetPositions,
        };

        socket.emit(SocketAction.INIT_HARDWARE, hardwareSettings);
        socket.on(SocketAction.INIT_HARDWARE_SUCCESS, (success: SocketMessage[SocketAction.INIT_HARDWARE_SUCCESS]) => {
          setStatus(success ? LoadStatus.Loaded : LoadStatus.Failed);
        });
      } catch (error) {
        setStatus(LoadStatus.Failed);
        console.error('Error initializing hardware:', error);
      }
    };

    initHardware();
  }, [settings, isSocketConnected, socket]);

  return { status };
};

export default useHardware;
