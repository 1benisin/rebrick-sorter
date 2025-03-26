// components/SerialPortFormInput.tsx

// In your components/SerialPortFormInput.tsx

import { Control } from 'react-hook-form';
import { SettingsType } from '@/types/settings.type';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import serviceManager from '@/lib/services/ServiceManager';
import { ServiceName } from '@/lib/services/Service.interface';
import { sortProcessStore } from '@/stores/sortProcessStore';
import { BackToFrontEvents, FrontToBackEvents } from '@/types/socketMessage.type';

interface SerialPortFormInputProps {
  control: Control<SettingsType>;
  name: any;
  label: string;
}

const SerialPortFormInput: React.FC<SerialPortFormInputProps> = ({ control, name, label }) => {
  const { serialPorts } = sortProcessStore();
  const [isLoading, setIsLoading] = useState(true);
  const socket = serviceManager.getService(ServiceName.SOCKET);

  useEffect(() => {
    setIsLoading(true);
    // trigger the event to backend to list serial ports.
    // which triggers frontend LIST_SERIAL_PORTs_SUCCESS event and saves port paths to sortProcessStore serialPorts variable
    socket.emit(FrontToBackEvents.LIST_SERIAL_PORTS, undefined);

    // Set up a one-time listener for the success event
    const handleSuccess = (ports: string[]) => {
      setIsLoading(false);
    };

    socket.on(BackToFrontEvents.LIST_SERIAL_PORTS_SUCCESS, handleSuccess);

    return () => {
      socket.off(BackToFrontEvents.LIST_SERIAL_PORTS_SUCCESS, handleSuccess);
    };
  }, [socket]);

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex flex-1 flex-col justify-between">
          <FormLabel>{label}</FormLabel>
          {isLoading ? (
            <Select disabled>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Loading ports..." />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="loading">Loading ports...</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <Select value={field.value} onValueChange={field.onChange}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Select Port" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {serialPorts.map((port) => (
                  <SelectItem key={port} value={port}>
                    {port}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <FormMessage />
        </FormItem>
      )}
    />
  );
};

export default SerialPortFormInput;
