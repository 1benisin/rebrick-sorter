// components/buttons/HomeSorterButton.tsx

'use client';

import { Button } from '@/components/ui/button';
import { ServiceName } from '@/lib/services/Service.interface';
import serviceManager from '@/lib/services/ServiceManager';
import { SocketAction } from '@/types/socketMessage.type';

const HomeSorterButton = () => {
  const handleClick = async () => {
    const socket = serviceManager.getService(ServiceName.SOCKET);
    if (!socket) return;
    socket.emit(SocketAction.HOME_SORTER, '0');
    // delay 100 ms to allow the sorter to process the command
    await new Promise((resolve) => setTimeout(resolve, 100));
    socket.emit(SocketAction.HOME_SORTER, '1');
  };

  return <Button onClick={handleClick}>Home Sorter</Button>;
};

export default HomeSorterButton;
