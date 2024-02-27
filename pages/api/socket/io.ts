import { Server as NetServer } from 'http';
import { NextApiRequest } from 'next';
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
  if (!res.socket.server.io) {
    const path = '/api/socket/io';
    const httpServer: NetServer = res.socket.server as any;
    const io = new ServerIO(httpServer, {
      path: path,
      // @ts-ignore
      addTrailingSlash: false,
    });
    io.on('connection', (socket) => {
      console.log('socket connected');

      // INIT_HARDWARE
      socket.on(SocketAction.INIT_HARDWARE, async (data) => {
        try {
          console.log('INIT_HARDWARE');
          const hardwareSettings = hardwareInitSchema.parse(data);

          // get the singleton instance of the SerialPortManager
          const hardwareController = HardwareController.getInstance();
          await hardwareController.init(hardwareSettings);
          console.log('INIT_HARDWARE_SUCCESS');
          socket.emit(SocketAction.INIT_HARDWARE_SUCCESS, true);
        } catch (error) {
          console.error(error);
          socket.emit(SocketAction.INIT_HARDWARE_SUCCESS, false);
        }
      });

      // SORT_PART
      socket.on(SocketAction.SORT_PART, async (data) => {
        try {
          const sortPartDto = sortPartSchema.parse(data);
          const hardwareController = HardwareController.getInstance();

          hardwareController.sortPart(sortPartDto);
          socket.emit(SocketAction.SORT_PART_SUCCESS, true);
        } catch (error) {
          console.error(error);
          socket.emit(SocketAction.SORT_PART_SUCCESS, false);
        }
      });

      // LOG_PART_QUEUE
      socket.on(SocketAction.LOG_PART_QUEUE, () => {
        console.log('LOG_PART_QUEUE');
        const hardwareController = HardwareController.getInstance();
        const partQueue = hardwareController.logPartQueue();
        socket.emit(SocketAction.LOG_PART_QUEUE_SUCCESS, partQueue);
      });

      // LOG_SPEED_QUEUE
      socket.on(SocketAction.LOG_SPEED_QUEUE, () => {
        console.log('LOG_SPEED_QUEUE');
        const hardwareController = HardwareController.getInstance();
        const speedQueue = hardwareController.logSpeedQueue();
        socket.emit(SocketAction.LOG_SPEED_QUEUE_SUCCESS, speedQueue);
      });
    });
    res.socket.server.io = io;
  }

  res.end();
};

export default ioHandler;
