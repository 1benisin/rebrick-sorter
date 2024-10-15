// components/buttons/ConveyorButton.tsx

// sorterControllerButton.jsx
'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import serviceManager from '@/lib/services/ServiceManager';
import { ServiceName } from '@/lib/services/Service.interface';
import { AllEvents } from '@/types/socketMessage.type';

const CalibrationButton = () => {
  const [isRunning, setIsRunning] = useState(false);

  const handleClick = async () => {
    const socket = serviceManager.getService(ServiceName.SOCKET);
    if (!socket) return;
    setIsRunning((prev) => !prev);
    socket.emit(AllEvents.CONVEYOR_ON_OFF, undefined);
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
