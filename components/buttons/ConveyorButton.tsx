// components/buttons/ConveyorButton.tsx

// sorterControllerButton.jsx
'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { SocketAction } from '@/types/socketMessage.type';
import serviceManager from '@/lib/services/ServiceManager';
import { ServiceName } from '@/lib/services/Service.interface';

const CalibrationButton = () => {
  const [isRunning, setIsRunning] = useState(false);

  const handleClick = async () => {
    const socket = serviceManager.getService(ServiceName.SOCKET);
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
