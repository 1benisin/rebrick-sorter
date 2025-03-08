// components/buttons/SortPartButton.tsx

'use client';

import { Button } from '@/components/ui/button';
import { ServiceName } from '@/lib/services/Service.interface';
import serviceManager from '@/lib/services/ServiceManager';
import { AllEvents } from '@/types/socketMessage.type';
import { SortPartDto } from '@/types/sortPart.dto';

const FakeSortPartButton = () => {
  const handleClick = () => {
    const socket = serviceManager.getService(ServiceName.SOCKET);
    if (!socket) return;

    const fakePayload: SortPartDto = {
      partId: 'fake-part-' + Math.random().toString(36).substr(2, 9),
      initialTime: Date.now(),
      initialPosition: Math.floor(Math.random() * 100),
      bin: Math.floor(Math.random() * 5),
      sorter: Math.floor(Math.random() * 3),
    };

    socket.emit(AllEvents.SORT_PART, fakePayload);
  };

  return (
    <Button type="button" onClick={handleClick}>
      Sort Part
    </Button>
  );
};

export default FakeSortPartButton;
