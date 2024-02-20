// sorterControllerButton.jsx
'use client';

import React, { useEffect, useState } from 'react';
import SortProcessCtrl from '@/lib/sortProcessCtrl';
import { Button } from '@/components/ui/button';
import { sortProcessStore } from '@/stores/sortProcessStore';
import useSortController from '@/hooks/useSortController';

const SortProcessCtrlButton = () => {
  const { isRunning } = sortProcessStore();
  const sortController = useSortController();

  const handleStartStop = () => {
    if (!sortController) return;

    if (isRunning) {
      sortController.stop();
    } else {
      sortController.start();
    }
  };

  return (
    <Button
      onClick={handleStartStop}
      className={`px-4 py-2 font-bold text-white rounded 
      ${isRunning ? 'bg-red-500 hover:bg-red-700' : 'bg-green-500 hover:bg-green-700'}`}
    >
      {isRunning ? 'Stop' : 'Start'}
    </Button>
  );
};

export default SortProcessCtrlButton;
