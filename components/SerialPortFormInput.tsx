// In your components/SerialPortFormInput.tsx

import { Control } from 'react-hook-form';
import { SettingsType } from '@/types/settings.type';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useEffect, useState } from 'react';
import { z } from 'zod';

interface SerialPortFormInputProps {
  control: Control<SettingsType>;
  name: any;
  label: string;
}

const SerialPortFormInput: React.FC<SerialPortFormInputProps> = ({ control, name, label }) => {
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

  if (!ports.length) return null;

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <Select defaultValue={field.value} onValueChange={field.onChange}>
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder="Select Port" />
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
          <FormMessage />
        </FormItem>
      )}
    />
  );
};

export default SerialPortFormInput;
