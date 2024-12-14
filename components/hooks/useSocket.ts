// hooks/useSocket.ts

import { ServiceName, ServiceState } from '@/lib/services/Service.interface';
import serviceManager from '@/lib/services/ServiceManager';
import { useState, useEffect } from 'react';
import { Socket } from 'socket.io-client';

type UseSocketResult = {
  socket: Socket | null;
  status: boolean;
  transport: string;
};

export const useSocket = (): UseSocketResult => {
  const [isConnected, setIsConnected] = useState(false);
  const [transport, setTransport] = useState('N/A');
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const socketService = serviceManager.getService(ServiceName.SOCKET);

    const updateStatus = () => {
      setIsConnected(socketService.getStatus() === ServiceState.INITIALIZED);
      setTransport(socketService.getTransport());
      setSocket(socketService.getSocket());
    };

    // Initial update
    updateStatus();

    // Set up listeners
    socketService.on('connect', updateStatus);
    socketService.on('disconnect', updateStatus);
    socketService.on('upgrade', updateStatus);

    return () => {
      socketService.off('connect', updateStatus);
      socketService.off('disconnect', updateStatus);
      socketService.off('upgrade', updateStatus);
    };
  }, []);

  return { status: isConnected, socket, transport };
};
