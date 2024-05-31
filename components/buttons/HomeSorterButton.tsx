// sorterControllerButton.jsx
'use client';

import { Button } from '@/components/ui/button';
import useSocket from '@/hooks/useSocket';
import { SocketAction } from '@/types/socketMessage.type';

const HomeSorterButton = () => {
  const { socket } = useSocket();

  const handleClick = async () => {
    if (!socket) return;
    socket.emit(SocketAction.HOME_SORTER, '0');
    // delay 100 ms to allow the sorter to process the command
    await new Promise((resolve) => setTimeout(resolve, 100));
    socket.emit(SocketAction.HOME_SORTER, '1');
  };

  return <Button onClick={handleClick}>Home Sorter</Button>;
};

export default HomeSorterButton;
