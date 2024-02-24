// /api/socket.ts
import type { Server as HTTPServer } from 'http';
import type { Socket as NetSocket } from 'net';
import { Server } from 'socket.io';

import { NextResponse } from 'next/server';

interface SocketServer extends HTTPServer {
  io?: Server | undefined;
}

interface SocketWithIO extends NetSocket {
  server: SocketServer;
}

interface ResponseWithSocket extends Response {
  socket: SocketWithIO;
}

export async function GET(req: Request, res: ResponseWithSocket) {
  if (res.socket.server.io) {
    console.log('Socket is already running');
  } else {
    console.log('Socket is initializing');
    const io = new Server(res.socket.server);
    res.socket.server.io = io;

    io.on('connection', (socket) => {
      socket.on('send-message', (obj) => {
        io.emit('receive-message', obj);
      });
    });

    io.on('connect_error', (err) => {
      console.log(`connect_error due to ${err.message}`);
      return new NextResponse('Socket error', { status: 500 });
    });
  }

  return new NextResponse('Socket initialized', { status: 200 });
}
