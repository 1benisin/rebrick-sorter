// components/buttons/HomeAllSortersButton.tsx

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useSocket } from '@/components/hooks/useSocket';
import { useToast } from '@/components/hooks/use-toast';
import { AllEvents } from '@/types/socketMessage.type';

const SORTER_COUNT = 4;

const HomeAllSortersButton = () => {
  const { socket } = useSocket();
  const { toast } = useToast();
  const [isHoming, setIsHoming] = useState(false);

  const handleClick = async () => {
    if (!socket || isHoming) return;

    setIsHoming(true);
    try {
      for (let sorter = 0; sorter < SORTER_COUNT; sorter++) {
        socket.emit(AllEvents.HOME_SORTER, { sorter });
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      toast({
        title: 'Home command sent',
        description: 'All 4 sorters are homing to bin 1.',
      });
    } finally {
      setIsHoming(false);
    }
  };

  return (
    <Button type="button" variant="outline" onClick={handleClick} disabled={!socket || isHoming}>
      {isHoming ? 'Homing...' : 'Home All Sorters'}
    </Button>
  );
};

export default HomeAllSortersButton;
