// server.ts

import path from 'path';
import dotenv from 'dotenv';

const envPath = path.resolve(__dirname, '../.env.local');
console.log('--- envPath', envPath);
dotenv.config({ path: envPath });

import hardwareManager from './server/HardwareManager';
import { createServer } from 'http';
import next from 'next';
import { Socket, Server as SocketIOServer } from 'socket.io';
import eventHub from './server/eventHub';
import { BackToFrontEvents, FrontToBackEvents } from './types/socketMessage.type';

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = 3000;
const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();
const listeners: { [key: string]: (...args: any[]) => void } = {};
let currentSocket: Socket | null = null;

app.prepare().then(async () => {
  const httpServer = createServer(handler);
  const io = new SocketIOServer(httpServer);

  const cleanupOldListeners = () => {
    Object.values(BackToFrontEvents).forEach((event) => {
      if (listeners[`B->F:${event}`]) {
        eventHub.offListener(event, listeners[`B->F:${event}`]);
        delete listeners[`B->F:${event}`];
      }
    });
  };

  const setupSocketListeners = (socket: Socket) => {
    console.log('New client connected');
    // Disconnect the previous socket if it exists
    if (currentSocket) {
      console.log('Disconnecting previous client');
      // currentSocket.disconnect();
    }
    // Set the current socket to the new connection
    currentSocket = socket;
    // Clean up old listeners before setting up new ones
    cleanupOldListeners();

    // Events from Backend to Frontend
    Object.values(BackToFrontEvents).forEach((event) => {
      listeners[`B->F:${event}`] = (data: any) => {
        console.log(`---B->F: ${event}`, data);
        if (currentSocket) {
          currentSocket.emit(event, data);
        }
      };
      eventHub.onEvent(event, listeners[`B->F:${event}`]);
    });

    Object.values(FrontToBackEvents).forEach((event) => {
      // Events from Frontend to Backend
      socket.on(event, (data: any) => {
        console.log(`---F->B: ${event}`, data);
        eventHub.emitEvent(event, data);
      });
    });

    // Handle client disconnection
    socket.on('disconnect', () => {
      console.log('Client disconnected');
      if (currentSocket === socket) {
        currentSocket = null;
        cleanupOldListeners();
      }
    });
  };

  io.on('connection', (socket) => {
    setupSocketListeners(socket);
    hardwareManager.init();
  });

  httpServer
    .once('error', (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
    });
});
