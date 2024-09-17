// components/buttons/MoverSorterButton.tsx

// sorterControllerButton.jsx
'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useSocket } from '@/hooks/useSocket';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { AllEvents } from '@/types/socketMessage.type';

const MoveSorterButton = () => {
  const [sorter, setSorter] = useState('0');
  const [bin, setBin] = useState('0');
  const { socket } = useSocket();

  const handleClick = async () => {
    if (!socket) return;
    console.log(AllEvents.MOVE_SORTER, { sorter, bin });
    socket.emit(AllEvents.MOVE_SORTER, { sorter, bin });
  };

  return (
    <Card className="flex items-end gap-3 p-2">
      <Button onClick={handleClick}>Move Sorter</Button>
      <div className="grid gap-1">
        <Label htmlFor="sorter">Sorter:</Label>
        <Input id="sorter" className="w-12" placeholder={sorter} onChange={(e) => setSorter(e.target.value)} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="bin">Bin:</Label>
        <Input id="bin" className="w-12" placeholder={bin} onChange={(e) => setBin(e.target.value)} />
      </div>
    </Card>
  );
};

export default MoveSorterButton;
