// pages/api/socket/io.ts

import { Server as NetServer } from 'http';
import { NextApiRequest, NextApiResponse } from 'next';
import { Server as ServerIO } from 'socket.io';
import { SocketAction } from '@/types/socketMessage.type';
import { hardwareInitSchema } from '@/types/hardwareInit.dto';
import HardwareController from '@/lib/hardware/hardwareController';
import { sortPartSchema } from '@/types/sortPart.dto';

import { NextApiResponseServerIo } from '@/types/nextApiResponseServerIo.type';

export const config = {
  api: {
    bodyParser: false,
  },
};

const ioHandler = (req: NextApiRequest, res: NextApiResponseServerIo) => {
  if (res.socket.server.io) {
    console.log('IO Already set up');
    res.end();
    return;
  }
  const httpServer: NetServer = res.socket.server as any;
  const io = new ServerIO(httpServer, {
    path: '/api/socket/io',
    addTrailingSlash: false,
  });

  io.on('disconnect', (reason) => {
    console.log('user disconnected', reason);
  });

  io.on('connection', (socket): void => {
    console.log('IO connected:', socket.id);

    socket.on('disconnect', (reason) => {
      console.log('user disconnected', socket.id, 'reason:', reason);
    });
    socket.on('connect', (reason) => {
      console.log('user connected', socket.id, 'reason:', reason);
    });
    socket.on('error', () => {
      console.log('socket error');
    });

    socket.on('abc', (data): void => {
      console.log('abc', data);
    });

    // INIT_HARDWARE
    socket.on(SocketAction.INIT_HARDWARE, (data) => {
      try {
        console.log('INIT_HARDWARE', data);

        const hardwareSettings = hardwareInitSchema.parse(data);

        // get the singleton instance of the SerialPortManager
        const hardwareController = HardwareController.getInstance();
        hardwareController
          .init(hardwareSettings)
          .then(() => {
            console.log('INIT_HARDWARE_SUCCESS');
            io.emit(SocketAction.INIT_HARDWARE_SUCCESS, true);
          })
          .catch((error) => {
            console.error(error);
            io.emit(SocketAction.INIT_HARDWARE_SUCCESS, false);
          });
      } catch (error) {
        console.error(error);
        io.emit(SocketAction.INIT_HARDWARE_SUCCESS, false);
      }
    });

    // SORT_PART
    socket.on(SocketAction.SORT_PART, async (data) => {
      try {
        const sortPartDto = sortPartSchema.parse(data);
        const hardwareController = HardwareController.getInstance();

        hardwareController.sortPart(sortPartDto);
        io.emit(SocketAction.SORT_PART_SUCCESS, true);
      } catch (error) {
        console.error(error);
        io.emit(SocketAction.SORT_PART_SUCCESS, false);
      }
    });

    // LOG_PART_QUEUE
    socket.on(SocketAction.LOG_PART_QUEUE, () => {
      console.log('LOG_PART_QUEUE');
      const hardwareController = HardwareController.getInstance();
      const partQueue = hardwareController.logPartQueue();
      io.emit(SocketAction.LOG_PART_QUEUE_SUCCESS, partQueue);
    });

    // LOG_SPEED_QUEUE
    socket.on(SocketAction.LOG_SPEED_QUEUE, () => {
      console.log('LOG_SPEED_QUEUE');
      const hardwareController = HardwareController.getInstance();
      const speedQueue = hardwareController.logSpeedQueue();
      io.emit(SocketAction.LOG_SPEED_QUEUE_SUCCESS, speedQueue);
    });
  });

  res.socket.server.io = io;

  res.end();
};

export default ioHandler;
