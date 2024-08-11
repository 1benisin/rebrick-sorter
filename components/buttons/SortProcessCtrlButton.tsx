// components/buttons/SortProcessCtrlButton.tsx

'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { sortProcessStore } from '@/stores/sortProcessStore';
import { SocketAction } from '@/types/socketMessage.type';
import serviceManager from '@/lib/services/ServiceManager';
import { ServiceName } from '@/lib/services/Service.interface';

const SortProcessCtrlButton = () => {
  const { isRunning } = sortProcessStore();

  const handleStartStop = () => {
    const sorterService = serviceManager.getService(ServiceName.SORTER);
    if (!sorterService) return;

    if (isRunning) {
      sorterService.stop();
      const socket = serviceManager.getService(ServiceName.SOCKET);
      if (!!socket) socket.emit(SocketAction.CLEAR_HARDWARE_ACTIONS);
    } else {
      sorterService.start();
    }
  };

  return (
    <Button
      onClick={handleStartStop}
      className={`m-2 rounded px-4 py-2 font-bold text-white ${isRunning ? 'bg-red-500 hover:bg-red-700' : 'bg-green-500 hover:bg-green-700'}`}
    >
      {isRunning ? 'Stop' : 'Start'}
    </Button>
  );
};

export default SortProcessCtrlButton;
