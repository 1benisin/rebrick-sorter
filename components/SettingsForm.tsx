// In your settings/page.tsx
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, SubmitHandler, useFieldArray } from 'react-hook-form';
import { settingsSchema, SettingsType, sorterSettingsSchema } from '@/types/settings.type';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import useSettings from '@/hooks/useSettings';
import SerialPortFormInput from '@/components/SerialPortFormInput';
import { useEffect } from 'react';

const SettingsForm = () => {
  const { settings, saveSettings, loaded } = useSettings();

  const form = useForm<SettingsType>({
    resolver: zodResolver(settingsSchema),
    // defaultValues: settings || settingsSchema.parse({}),
    values: settings || settingsSchema.parse({}),
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'sorters',
  });

  useEffect(() => {
    if (!!settings) {
      console.log('Settings loaded:', settings);
      // Reset form with loaded settings once they are available
      form.reset(settings);
    }
  }, [loaded, settings, form.reset]);

  useEffect(() => {
    console.log('Settings changed:', form.getValues());
  }, [form.getValues()]);

  const onSubmit: SubmitHandler<SettingsType> = (data) => {
    console.log('Saving Settings data: ', data);
    saveSettings(data);
  };

  if (!loaded) return null;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-2">
        <FormField
          control={form.control}
          name="conveyorSpeed_PPS"
          render={({ field }) => (
            <FormItem>
              <FormLabel>ConveyorSpeed_PPS</FormLabel>
              <FormControl>
                <Input type="number" {...field} />
              </FormControl>
              <FormDescription>how fast the default speed is in pixels per second </FormDescription>
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
              <FormDescription>how close in pixels part detections will be skipped if too close</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <SerialPortFormInput
          control={form.control}
          name="conveyorJetsSerialPort"
          label="Conveyor Jets Serial Port"
          description="Select a serial port"
        />
        <SerialPortFormInput
          control={form.control}
          name="hopperFeederSerialPort"
          label="Hopper Feeder Serial Port"
          description="Select a serial port"
        />

        {fields.map((field, index) => (
          <div key={field.id} className="flex items-center space-x-2 p-4 border border-slate-300 rounded-md">
            <SerialPortFormInput control={form.control} name={`sorters.${index}.serialPort`} label="Serial Port" description="Select a serial port" />
            <FormField
              control={form.control}
              name={`sorters.${index}.name`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormDescription>how close in pixels part detections will be skipped if too close</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name={`sorters.${index}.gridWidth`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Grid Width</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} />
                  </FormControl>
                  <FormDescription>how close in pixels part detections will be skipped if too close</FormDescription>
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
                  <FormDescription>how close in pixels part detections will be skipped if too close</FormDescription>
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

    // add fields for sorters here
  );
};

export default SettingsForm;
