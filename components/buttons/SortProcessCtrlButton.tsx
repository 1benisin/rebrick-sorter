// components/buttons/SortProcessCtrlButton.tsx

'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { sortProcessStore } from '@/stores/sortProcessStore';
import serviceManager from '@/lib/services/ServiceManager';
import { ServiceName } from '@/lib/services/Service.interface';
import { AllEvents } from '@/types/socketMessage.type';

const SortProcessCtrlButton = () => {
  const { isRunning } = sortProcessStore();

  const handleStartStop = () => {
    const sorterService = serviceManager.getService(ServiceName.SORTER);
    if (!sorterService) return;

    if (isRunning) {
      sorterService.stop();
    } else {
      sorterService.start();
    }
  };

  return (
    <Button
      type="button"
      onClick={handleStartStop}
      className={`m-2 rounded px-4 py-2 font-bold text-white ${isRunning ? 'bg-red-500 hover:bg-red-700' : 'bg-green-500 hover:bg-green-700'}`}
    >
      {isRunning ? 'Stop' : 'Start'}
    </Button>
  );
};

export default SortProcessCtrlButton;
