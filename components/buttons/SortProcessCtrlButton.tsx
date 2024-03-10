// sorterControllerButton.jsx
'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { sortProcessStore } from '@/stores/sortProcessStore';
import useSortController from '@/hooks/useSortController';
import useSocket from '@/hooks/useSocket';
import { SocketAction } from '@/types/socketMessage.type';

const SortProcessCtrlButton = () => {
  const { isRunning } = sortProcessStore();
  const { controller } = useSortController();
  const { socket } = useSocket();

  const handleStartStop = () => {
    if (!controller) return;

    if (isRunning) {
      controller.stop();
      if (!!socket) socket.emit(SocketAction.CLEAR_HARDWARE_ACTIONS);
    } else {
      controller.start();
    }
  };

  if (!controller) return null;

  return (
    <Button
      onClick={handleStartStop}
      className={`px-4 py-2 font-bold text-white rounded m-2
      ${isRunning ? 'bg-red-500 hover:bg-red-700' : 'bg-green-500 hover:bg-green-700'}`}
    >
      {isRunning ? 'Stop' : 'Start'}
    </Button>
  );
};

export default SortProcessCtrlButton;
