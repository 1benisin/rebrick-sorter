// In your settings/page.tsx
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, SubmitHandler, useFieldArray } from 'react-hook-form';
import { settingsSchema, SettingsType, sorterSettingsSchema } from '@/types/settings.type';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import useSettings from '@/hooks/useSettings';
import SerialPortFormInput from '@/components/SerialPortFormInput';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { serialPortNamesArray } from '@/types/serialPort.type';

const SettingsForm = () => {
  const { settings, saveSettings, loaded } = useSettings();

  const form = useForm<SettingsType>({
    resolver: zodResolver(settingsSchema),
    // defaultValues: settings || settingsSchema.parse({}),
    values: settings || settingsSchema.parse({}),
    mode: 'onBlur',
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'sorters',
  });

  const onSubmit: SubmitHandler<SettingsType> = (data) => {
    console.log('Saving Settings data: ', data);
    saveSettings(data);
  };

  if (!loaded) return null;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-2">
        <div className="grid gap-4 grid-cols-3 p-3 border border-slate-300 rounded-md">
          <FormField
            control={form.control}
            name="conveyorSpeed_PPS"
            render={({ field }) => (
              <FormItem>
                <FormLabel>ConveyorSpeed_PPS</FormLabel>
                <FormControl>
                  <Input type="number" {...field} />
                </FormControl>

                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="detectDistanceThreshold"
            render={({ field }) => (
              <FormItem>
                <FormLabel>detectDistanceThreshold</FormLabel>
                <FormControl>
                  <Input type="number" {...field} />
                </FormControl>

                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="classificationThresholdPercentage"
            render={({ field }) => (
              <FormItem>
                <FormLabel>classificationThresholdPercentage</FormLabel>
                <FormControl>
                  <Input type="number" {...field} />
                </FormControl>

                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="camera1VerticalPositionPercentage"
            render={({ field }) => (
              <FormItem>
                <FormLabel>camera1VerticalPositionPercentage</FormLabel>
                <FormControl>
                  <Input type="number" {...field} />
                </FormControl>

                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="camera2VerticalPositionPercentage"
            render={({ field }) => (
              <FormItem>
                <FormLabel>camera2VerticalPositionPercentage</FormLabel>
                <FormControl>
                  <Input type="number" {...field} />
                </FormControl>

                <FormMessage />
              </FormItem>
            )}
          />

          <SerialPortFormInput control={form.control} name="conveyorJetsSerialPort" label="Conveyor Jets Serial Port" />
          <SerialPortFormInput control={form.control} name="hopperFeederSerialPort" label="Hopper Feeder Serial Port" />
        </div>
        {fields.map((field, index) => (
          <div key={field.id} className="flex flex-row space-x-2 p-4 border border-slate-300 rounded-md">
            <FormField
              control={form.control}
              name={`sorters.${index}.name`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Arduino Name</FormLabel>
                  <Select defaultValue={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a name for port" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {serialPortNamesArray.map((portName) => (
                        <SelectItem key={portName} value={portName}>
                          {portName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <FormMessage />
                </FormItem>
              )}
            />
            <SerialPortFormInput control={form.control} name={`sorters.${index}.serialPort`} label="Serial Port" />

            <FormField
              control={form.control}
              name={`sorters.${index}.gridWidth`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Grid Width</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} />
                  </FormControl>

                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name={`sorters.${index}.gridHeight`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Grid Height</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} />
                  </FormControl>

                  <FormMessage />
                </FormItem>
              )}
            />
            <Button size="sm" variant="destructive" onClick={() => remove(index)}>
              Delete
            </Button>
          </div>
        ))}
        <Button type="button" onClick={() => append(sorterSettingsSchema.parse({}))}>
          Add Sorter
        </Button>
        <Button type="submit">Save Settings</Button>
      </form>
    </Form>
  );
};

export default SettingsForm;
