// contexts/SocketContext.tsx
'use client';

import { SocketAction } from '@/types/socketMessage.type';
import { createContext, useEffect, useState, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { LoadStatus } from '@/types/loadStatus.type';

type SocketContextType = {
  socket: Socket | null;
  status: LoadStatus;
};

export const SocketContext = createContext<SocketContextType>({
  socket: null,
  status: LoadStatus.Loading,
});

let socketInstance: Socket | null = null;
let loadOnce = false;

export const SocketProvider = ({ children }: { children: ReactNode }) => {
  const [status, setStatus] = useState<LoadStatus>(LoadStatus.Loading);

  useEffect(() => {
    console.log('SocketProvider rendered');
    if (!socketInstance) {
      init();
    }

    return () => {
      console.log('SocketProvider cleanup');
      if (socketInstance) {
        console.log('disconnecting socket');
        socketInstance.disconnect();
      }
    };
  }, []);

  const init = async () => {
    if (loadOnce) return;
    loadOnce = true;

    setStatus(LoadStatus.Loading);

    await fetch('/api/socket/io');

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
  };

  return <SocketContext.Provider value={{ socket: socketInstance, status }}>{children}</SocketContext.Provider>;
};
