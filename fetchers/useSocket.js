import { useEffect } from 'react';
import io from 'Socket.IO-client';
let socket;

const useSocket = () => {
  useEffect(() => {
    const socketInitializer = async () => {
      await fetch('/api/socket');
      socket = io();

      socket.on('connect', () => console.log('Socket Connected'));
    };
    socketInitializer();
  }, []);

  return socket;
};

export default useSocket;
