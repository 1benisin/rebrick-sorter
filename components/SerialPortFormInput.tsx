// In your settings/page.tsx
'use client';

import { Control } from 'react-hook-form';
import { SettingsFormType } from '@/types/settingsForm.d';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useEffect, useState } from 'react';
import { z } from 'zod';

interface SerialPortFormInputProps {
  control: Control<SettingsFormType>;
  name: any;
  label: string;
  description: string;
}

const SerialPortFormInput: React.FC<SerialPortFormInputProps> = ({ control, name, label, description }) => {
  const [ports, setPorts] = useState<string[]>([]);

  useEffect(() => {
    const fetchSerialPorts = async () => {
      try {
        const response = await fetch('/api/hardware/serialport');
        const data = await response.json();

        // validate array of strings with zod
        const arduinoPortType = z.array(z.string());
        arduinoPortType.parse(data);

        setPorts(data);
      } catch (error) {
        console.error(error);
      }
    };

    fetchSerialPorts();
  }, []);

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>{' '}
          <Select onValueChange={field.onChange}>
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder="Select a Serial Port" />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {ports.map((port) => (
                <SelectItem key={port} value={port}>
                  {port}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormDescription>{description}</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
};

export default SerialPortFormInput;
