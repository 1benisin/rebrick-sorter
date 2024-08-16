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
  // const [ports, setPorts] = useState<string[]>(serialPorts);
  const socket = serviceManager.getService(ServiceName.SOCKET);

  useEffect(() => {
    // trigger the event to backend to list serial ports.
    // which triggers frontend LIST_SERIAL_PORTs_SUCCESS event and saves port paths to sortProcessStore serialPorts variable
    socket.emit(FrontToBackEvents.LIST_SERIAL_PORTS);
  }, [socket]);

  // useEffect(() => {
  //   const fetchSerialPorts = async () => {
  //     try {

  //   const socket = serviceManager.getService(ServiceName.SOCKET);

  //       const response = await fetch('/api/hardware/serialport');
  //       const data = await response.json();

  //       // validate array of strings with zod
  //       const arduinoPortType = z.array(z.string());
  //       arduinoPortType.parse(data);
  //       setPorts(data);
  //     } catch (error) {
  //       console.error(error);
  //     }
  //   };

  //   fetchSerialPorts();
  // }, []);

  // if (!serialPorts.length) return null;

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem onClick={() => console.log('serialPorts', serialPorts)}>
          <FormLabel onClick={() => console.log('serialPorts', serialPorts)}>{label}</FormLabel>
          <Select defaultValue={field.value} onValueChange={field.onChange}>
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
          <FormMessage />
        </FormItem>
      )}
    />
  );
};

export default SerialPortFormInput;
