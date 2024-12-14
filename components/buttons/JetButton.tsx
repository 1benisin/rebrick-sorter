// components/buttons/JetButton.tsx

// sorterControllerButton.jsx
'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useSocket } from '@/components/hooks/useSocket';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { AllEvents } from '@/types/socketMessage.type';

const JetButton = () => {
  const [jet, setJet] = useState('0');
  const { socket } = useSocket();

  const handleClick = async () => {
    if (!socket) return;
    console.log(AllEvents.FIRE_JET, jet);
    socket.emit(AllEvents.FIRE_JET, { sorter: parseInt(jet) });
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
