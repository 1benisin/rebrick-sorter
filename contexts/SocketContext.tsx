'use client';

import { SocketAction } from '@/types/socketMessage.type';
import { createContext, useEffect, useState, ReactNode } from 'react';
import { io as ClientIO, Socket } from 'socket.io-client';
import { LoadStatus } from '@/types/loadStatus.type';

type SocketContextType = {
  socket: Socket | null;
  status: LoadStatus;
};

export const SocketContext = createContext<SocketContextType>({
  socket: null,
  status: LoadStatus.Loading,
});

export const SocketProvider = ({ children }: { children: ReactNode }) => {
  const [socket, setSocket] = useState(null);
  const [status, setStatus] = useState<LoadStatus>(LoadStatus.Loading);

  useEffect(() => {
    const socketInstance = new (ClientIO as any)(process.env.NEXT_PUBLIC_SITE_URL!, {
      path: '/api/socket/io',
      addTrailingSlash: false,
    });

    socketInstance.on('connect', () => {
      setStatus(LoadStatus.Loaded);
    });

    socketInstance.on('disconnect', () => {
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

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  return <SocketContext.Provider value={{ socket, status }}>{children}</SocketContext.Provider>;
};
