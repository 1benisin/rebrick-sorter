// server.ts

import path from 'path';
import dotenv from 'dotenv';
import { createServer } from 'http';
import next from 'next';
import { Server as SocketIOServer } from 'socket.io';
import { SystemCoordinator } from './server/SystemCoordinator';

const envPath = path.resolve(__dirname, '../.env.local');
dotenv.config({ path: envPath });

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = 3000;
const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

app.prepare().then(async () => {
  const httpServer = createServer(handler);
  const io = new SocketIOServer(httpServer);

  // Create and initialize server
  const systemCoordinator = new SystemCoordinator(io);

  httpServer
    .once('error', (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
    });
});
