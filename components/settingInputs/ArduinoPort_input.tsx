// ArduinoPort_input.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { settingsStore } from '@/stores/settingsStore';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArduinoPortType } from '@/types/arduinoPort';
import { validate, validateOrReject } from 'class-validator';

const ArduinoPortInput = () => {
  const [ports, setPorts] = useState<ArduinoPortType[]>([]);
  const [selectedPort, setSelectedPort] = useState('');

  useEffect(() => {
    const fetchSerialPorts = async () => {
      const response = await fetch('/api/hardware/serialport');
      const data = await response.json();

      // vaiidate the data or return an { name: 'error', path: 'validation error' }
      const arduinoPorts: ArduinoPortType[] = data.map((port: ArduinoPortType) => {
        validateOrReject(port).catch((errors) => {
          console.error('validation error', errors);
          return { name: 'error', path: 'validation error' };
        });
        return port;
      });

      setPorts(arduinoPorts);
    };

    fetchSerialPorts();
  }, []);

  const handlePortChange = (value: String) => {
    console.log('selected port', value);
  };

  return (
    <Select onValueChange={handlePortChange}>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="Select a serial port" />
      </SelectTrigger>

      <SelectContent>
        <SelectGroup>
          {ports.map((port: ArduinoPortType) => (
            <SelectItem key={port.path} value={port.path}>
              {port.path}
            </SelectItem>
          ))}
          <SelectItem value="port1">Port 1</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
};

export default ArduinoPortInput;
