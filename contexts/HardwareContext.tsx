'use client';

import React, { createContext, useState, useEffect, ReactNode } from 'react';
import { HardwareInitDto } from '@/types/hardwareInit.dto';
import useSettings from '@/hooks/useSettings';
import useSocket from '@/hooks/useSocket';
import { LoadStatus } from '@/types/loadStatus.type';
import { SocketAction } from '@/types/socketMessage.type';
import { serialPortNames } from '@/types/serialPort.type';

// Define the type for the context's value
type HardwareContextType = {
  status: LoadStatus;
  init: () => void;
};

// Create the Hardware context with a default value
export const HardwareContext = createContext<HardwareContextType | undefined>(undefined);

// Define the provider component
export const HardwareProvider = ({ children }: { children: ReactNode }) => {
  const [status, setStatus] = useState<LoadStatus>(LoadStatus.Loading);
  const { settings, status: settingsStatus } = useSettings();
  const { socket, status: socketStatus } = useSocket();

  useEffect(() => {
    if (!socket) return;
  }, [socket]);

  useEffect(() => {
    setStatus(LoadStatus.Loading);

    init();
  }, [settings, socket]);

  const init = async () => {
    console.log('Initializing hardware');
    try {
      if (!settings || !socket) {
        setStatus(LoadStatus.Failed);
        return;
      }

      const hardwareSettings: HardwareInitDto = {
        defaultConveyorSpeed_PPS: settings.conveyorSpeed_PPS,
        serialPorts: settings.sorters
          .map((sorter) => ({ name: sorter.name, path: sorter.serialPort }))
          .concat([
            { name: serialPortNames.conveyor_jets, path: settings.conveyorJetsSerialPort },
            { name: serialPortNames.hopper_feeder, path: settings.hopperFeederSerialPort },
          ]),
        sorterDimensions: settings.sorters.map((sorter) => ({ gridWidth: sorter.gridWidth, gridHeight: sorter.gridHeight })),
        jetPositions: settings.sorters.map((sorter) => sorter.jetPosition),
      };

      socket.on(SocketAction.INIT_HARDWARE_SUCCESS, (succes) => {
        console.log('INIT_HARDWARE_SUCCESS');
        if (succes) {
          setStatus(LoadStatus.Loaded);
        } else {
          setStatus(LoadStatus.Failed);
        }
      });

      socket.emit(SocketAction.INIT_HARDWARE, hardwareSettings);
    } catch (error) {
      setStatus(LoadStatus.Failed);
      console.error('Error initializing hardware:', error);
    }
  };

  return <HardwareContext.Provider value={{ status, init }}>{children}</HardwareContext.Provider>;
};
