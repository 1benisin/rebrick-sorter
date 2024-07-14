// contexts/SocketContext.tsx
'use client';

import { SocketAction } from '@/types/socketMessage.type';
import { createContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { LoadStatus } from '@/types/loadStatus.type';
import useSettings from '@/hooks/useSettings';
import { sortProcessStore } from '@/stores/sortProcessStore';

type SocketContextType = {
  socket: Socket | null;
  status: LoadStatus;
  init: () => void;
};

export const SocketContext = createContext<SocketContextType>({
  socket: null,
  status: LoadStatus.Loading,
  init: () => {},
});

let socketInstance: Socket | null = null;

export const SocketProvider = ({ children }: { children: ReactNode }) => {
  const [status, setStatus] = useState<LoadStatus>(LoadStatus.Loading);
  const { settings, status: settingsStatus } = useSettings();

  const init = useCallback(async () => {
    console.log('Initializing socket', socketInstance, settingsStatus);
    if (!socketInstance && settingsStatus === LoadStatus.Loaded) {
      socketInstance = io(process.env.NEXT_PUBLIC_SITE_URL!, {
        path: '/api/socket/io',
        addTrailingSlash: false,
      });

      socketInstance.on('connect', () => {
        console.log('SOCKET CONNECTED');
        setStatus(LoadStatus.Loaded);
      });

      socketInstance.on('disconnect', () => {
        setStatus(LoadStatus.Failed);
      });

      socketInstance.on('error', () => {
        console.log('socket error');
      });

      socketInstance.on('connect_error', () => {
        console.log('socket connect_error');
        setStatus(LoadStatus.Failed);
      });

      socketInstance.on(SocketAction.LOG_PART_QUEUE_SUCCESS, (data: any) => {
        console.log('Part Queue: ', data);
      });

      socketInstance.on(SocketAction.LOG_SPEED_QUEUE_SUCCESS, (data: any) => {
        console.log('Speed Queue: ', data);
      });

      socketInstance.on(SocketAction.INIT_HARDWARE_SUCCESS, (succes: boolean) => {
        console.log('INIT_HARDWARE_SUCCESS result: ', succes);
      });

      socketInstance.on(SocketAction.CONVEYOR_SPEED_UPDATE, (speed: number) => {
        console.log('CONVEYOR_SPEED_UPDATE: ', speed);
        sortProcessStore.getState().setConveyorSpeed(speed);
      });
    }
  }, [settingsStatus]);

  useEffect(() => {
    console.log('SocketProvider rendered');
    init();

    return () => {
      console.log('SocketProvider cleanup');
      if (socketInstance) {
        console.log('disconnecting socket');
        socketInstance.disconnect();
      }
    };
  }, [settings, init]);

  return <SocketContext.Provider value={{ socket: socketInstance, status, init }}>{children}</SocketContext.Provider>;
};
