// hooks/useSocket.ts

'use client';

// import { useEffect, useState } from 'react';
// import io, { Socket } from 'socket.io-client';

// let socketInstance: Socket | null = null;

// const useSocket = () => {
//   useEffect(() => {
//     if (!socketInstance) socketInitializer();

//     return () => {
//       console.log('useSocket cleanup');
//       if (socketInstance) {
//         console.log('disconnecting socket');
//         socketInstance.disconnect();
//       }
//     };
//   }, []);

//   async function socketInitializer() {
//     // ping the server to setup a socket if not already running
//     await fetch('/api/socket/io');

//     // Setup the Socket
//     // socket = io({ path: '/api/socket/io' });
//     const socketInstance = io(process.env.NEXT_PUBLIC_SITE_URL!, {
//       path: '/api/socket/io',
//       addTrailingSlash: false,
//     });

//     // Standard socket management
//     socketInstance.on('connect', () => {
//       console.log('Connected to the server');
//     });

//     socketInstance.on('disconnect', () => {
//       console.log('Disconnected from the server');
//     });

//     socketInstance.on('connect_error', (error) => {
//       console.log('Connection error:', error);
//     });

//     socketInstance.on('reconnect', (attemptNumber) => {
//       console.log('Reconnected to the server. Attempt:', attemptNumber);
//     });

//     socketInstance.on('reconnect_error', (error) => {
//       console.log('Reconnection error:', error);
//     });

//     socketInstance.on('reconnect_failed', () => {
//       console.log('Failed to reconnect to the server');
//     });
//   }

//   return { socket: socketInstance };
// };

// export default useSocket;

import { useContext } from 'react';
import { SocketContext } from '@/contexts/SocketContext';

const useSocket = () => {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

export default useSocket;
