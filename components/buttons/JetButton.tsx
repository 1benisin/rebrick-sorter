// components/buttons/JetButton.tsx

// sorterControllerButton.jsx
'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import useSocket from '@/hooks/useSocket';
import { SocketAction } from '@/types/socketMessage.type';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';

const JetButton = () => {
  const [jet, setJet] = useState('0');
  const { socket } = useSocket();

  const handleClick = async () => {
    if (!socket) return;
    console.log(SocketAction.FIRE_JET, jet);
    socket.emit(SocketAction.FIRE_JET, jet);
  };

  return (
    <Card className="flex items-end gap-3 p-2">
      <Button onClick={handleClick}>Fire Jet</Button>
      <div className="grid gap-1">
        <Label htmlFor="jet">Jet:</Label>
        <Input id="jest" className="w-12" placeholder={jet} onChange={(e) => setJet(e.target.value)} />
      </div>
    </Card>
  );
};

export default JetButton;
