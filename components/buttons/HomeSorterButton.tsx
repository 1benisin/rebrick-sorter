// sorterControllerButton.jsx
'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import useSocket from '@/hooks/useSocket';
import { SocketAction } from '@/types/socketMessage.type';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';

const HomeSorterButton = () => {
  const [sorter, setSorter] = useState('0');
  const { socket } = useSocket();

  const handleClick = async () => {
    if (!socket) return;
    console.log(SocketAction.HOME_SORTER, sorter);
    socket.emit(SocketAction.HOME_SORTER, sorter);
  };

  return (
    <Card className="flex gap-3 items-end p-2">
      <Button onClick={handleClick}>Home Sorter</Button>
      <div className="grid gap-1">
        <Label htmlFor="sorter">Sorter:</Label>
        <Input id="sorter" className="w-12" placeholder={sorter} onChange={(e) => setSorter(e.target.value)} />
      </div>
    </Card>
  );
};

export default HomeSorterButton;
