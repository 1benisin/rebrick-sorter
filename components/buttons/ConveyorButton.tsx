// sorterControllerButton.jsx
'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import useSocket from '@/hooks/useSocket';
import { SocketAction } from '@/types/socketMessage.type';

const CalibrationButton = () => {
  const [isRunning, setIsRunning] = useState(false);
  const { socket } = useSocket();

  const handleClick = async () => {
    if (!socket) return;
    setIsRunning((prev) => !prev);
    socket.emit(SocketAction.CONVEYOR_ON_OFF);
  };

  return (
    <Button
      className="bg-green-500 font-bold text-white hover:bg-green-700"
      variant={isRunning ? 'outline' : 'default'}
      onClick={handleClick}
    >
      Conveyor
    </Button>
  );
};

export default CalibrationButton;
